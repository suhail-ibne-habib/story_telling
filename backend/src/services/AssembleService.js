const fs = require("fs");
const path = require("path");

const StorageService = require("../../storage/StorageService");
const FFmpegService = require("./FFmpegService");
const FFprobeService = require("./FFprobeService");
const RecapService = require("./RecapService");
const CutService = require("./CutService");
const { readJson, writeJson } = require("../utils/jsonFile");

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

class AssembleService {

    videosPath(jobId) {
        return path.join(StorageService.getPaths(jobId).output, "videos.json");
    }

    async assemble(jobId) {
        const manifest = await RecapService.loadManifest(jobId);
        const paths = StorageService.getPaths(jobId);
        const videos = [];
        const cuts = [];

        for (const angle of manifest.angles) {
            const cut = await CutService.loadAngle(jobId, angle);
            const partsDir = path.join(paths.output, `${angle}_parts`);
            const outputPath = path.join(paths.output, `${angle}.mp4`);

            await fs.promises.mkdir(partsDir, { recursive: true });

            const parts = [];

            for (const beat of cut.beats) {
                const partPath = path.join(partsDir, `${beat.beat_id}.mp4`);

                await FFmpegService.muxVoice({
                    videoPath: path.join(paths.root, beat.clip),
                    audioPath: path.join(paths.root, beat.audio),
                    outputPath: partPath,
                    durationSec: beat.clip_duration_sec
                });

                parts.push(partPath);
            }

            const listPath = path.join(partsDir, "list.txt");
            await fs.promises.writeFile(
                listPath,
                parts.map((part) => `file '${part.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n",
                "utf-8"
            );

            await FFmpegService.concat({ listPath, outputPath });

            const durationSec = await FFprobeService.durationSeconds(outputPath);
            console.log(`[Assemble] ${angle}: ${outputPath} (${durationSec.toFixed(1)}s)`);

            videos.push({
                angle,
                label: cut.label,
                title: cut.title,
                file: `output/${angle}.mp4`,
                duration_sec: Number(durationSec.toFixed(3)),
                beats: cut.beats.length,
                needs_review: cut.needs_review,
                cut_created_at: cut.created_at || null
            });
            cuts.push(cut);
        }

        const payload = { created_at: new Date().toISOString(), videos };

        await writeJson(this.videosPath(jobId), payload);
        await this.writeReviewPage(jobId, videos, cuts);

        return payload;
    }

    async isDone(jobId) {
        const file = this.videosPath(jobId);

        if (!fs.existsSync(file)) {
            return false;
        }

        const manifest = await RecapService.loadManifest(jobId).catch(() => null);
        const { videos = [] } = await readJson(file).catch(() => ({}));
        const root = StorageService.getPaths(jobId).root;

        if (!manifest?.angles?.length) {
            return false;
        }

        for (const angle of manifest.angles) {
            const cut = await CutService.loadAngle(jobId, angle).catch(() => null);
            const video = videos.find((item) => item.angle === angle);

            if (!cut || !video || video.cut_created_at !== (cut.created_at || null) ||
                !fs.existsSync(path.join(root, video.file))) {
                return false;
            }
        }

        return true;
    }

    async writeReviewPage(jobId, videos, cuts) {
        const paths = StorageService.getPaths(jobId);
        const sections = cuts.map((cut, order) => {
            const video = videos[order];
            const beats = cut.beats.map((beat) => `
                <section class="beat${beat.needs_review ? " review" : ""}">
                    <h3>${escapeHtml(beat.beat_id)}${beat.rewritten ? ' <span class="flag">line rewritten</span>' : ""}${beat.needs_review ? ' <span class="flag">needs review</span>' : ""}</h3>
                    <p class="line">${escapeHtml(beat.text)}</p>
                    ${beat.rewritten ? `<p class="meta">Original: ${escapeHtml(beat.original_text)}</p>` : ""}
                    <p class="meta">Expected: ${escapeHtml(beat.shows)}</p>
                    <p class="meta">Cited: ${(beat.moments || []).map((moment) => `${escapeHtml(moment.id)} (${escapeHtml(moment.clock)}) ${escapeHtml(moment.shows)}`).join(" · ")}</p>
                    ${(beat.parts || []).length > 1
                        ? beat.parts.map((part, order) => `<p class="meta">Shot ${order + 1}: ${escapeHtml(part.moment_id)} ${escapeHtml(part.start_clock)} (${part.duration_sec.toFixed(1)}s)
                        · wanted "${escapeHtml(part.shows)}" · score ${part.score ?? "n/a"} · ${escapeHtml(part.reason)}</p>`).join("\n")
                        : `<p class="meta">Chosen: ${escapeHtml(beat.chosen.moment_id)} ${escapeHtml(beat.chosen.start_clock)}–${escapeHtml(beat.chosen.end_clock)}
                        · score ${beat.chosen.score ?? "n/a"} · ${escapeHtml(beat.chosen.reason)}</p>`}
                    <div class="grid">
                        <video controls src="../${escapeHtml(beat.clip)}"></video>
                        <audio controls src="../${escapeHtml(beat.audio)}"></audio>
                    </div>
                </section>`).join("\n");

            return `
            <article class="angle">
                <h2>${escapeHtml(cut.label)}: ${escapeHtml(cut.title)}</h2>
                <video class="final" controls src="../${escapeHtml(video.file)}"></video>
                <p class="meta">${video.beats} beats · ${video.duration_sec.toFixed(1)}s · ${video.needs_review.length} need review</p>
                ${beats}
            </article>`;
        }).join("\n");

        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Recap review</title>
  <style>
    body { font-family: Georgia, serif; background: #111; color: #eee; margin: 0; padding: 24px; }
    h1, h2, h3 { font-family: Arial, sans-serif; }
    .angle { border-top: 2px solid #555; padding: 24px 0; }
    .final { width: min(960px, 100%); background: #000; }
    .beat { border-left: 4px solid #444; padding: 8px 16px; margin: 16px 0; }
    .beat.review { border-left-color: #d27a4a; }
    .flag { color: #d27a4a; font-size: 0.8rem; }
    .line { font-size: 1.1rem; }
    .meta { color: #aaa; font-size: 0.9rem; }
    .grid { display: grid; grid-template-columns: minmax(240px, 480px) minmax(200px, 320px); gap: 12px; align-items: center; }
    video, audio { width: 100%; background: #000; }
  </style>
</head>
<body>
  <h1>Recap review</h1>
  ${sections}
</body>
</html>
`;

        await fs.promises.mkdir(paths.review, { recursive: true });
        await fs.promises.writeFile(path.join(paths.review, "index.html"), html, "utf-8");
    }
}

module.exports = new AssembleService();
