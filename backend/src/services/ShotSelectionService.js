const fs = require("fs");
const path = require("path");

const StorageService = require("../../storage/StorageService");
const GeminiService = require("./GeminiService");
const FFmpegService = require("./FFmpegService");
const ShotSelectionPromptBuilder = require("./ShotSelectionPromptBuilder");

const MAX_THUMBS = 40;

class ShotSelectionService {

    parseResponse(raw) {
        const stripped = String(raw || "")
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        const start = stripped.indexOf("{");
        const end = stripped.lastIndexOf("}");

        if (start === -1 || end === -1 || end <= start) {
            throw new Error("Gemini shot selection did not return a JSON object.");
        }

        return JSON.parse(stripped.slice(start, end + 1));
    }

    pickThumbs(shots) {
        if (shots.length <= MAX_THUMBS) {
            return shots;
        }

        const picked = [];
        const last = shots.length - 1;

        for (let i = 0; i < MAX_THUMBS; i += 1) {
            const index = Math.round((i * last) / (MAX_THUMBS - 1));
            const shot = shots[index];

            if (!picked.find((item) => item.index === shot.index)) {
                picked.push(shot);
            }
        }

        return picked;
    }

    pickByMatch({
        parsed,
        shots,
        durationSec
    }) {
        const byIndex = new Map(
            shots.map((shot) => [Number(shot.index), shot])
        );

        const rows = Array.isArray(parsed?.shots)
            ? parsed.shots
            : [];

        const scored = [];

        for (const row of rows) {
            const index = Number(row.shot ?? row.shot_number ?? row.index);
            const shot = byIndex.get(index);

            if (!shot) {
                continue;
            }

            scored.push({
                index,
                sequence: Number(row.sequence) || 1,
                match: Number(row.match ?? row.score ?? row.matching) || 0,
                shot
            });
        }

        scored.sort((a, b) => b.match - a.match || a.index - b.index);

        const picked = [];
        const used = new Set();
        let filled = 0;
        const target = Math.max(0.5, Number(durationSec) || 0);

        for (const item of scored) {
            if (used.has(item.index)) {
                continue;
            }

            picked.push(item);
            used.add(item.index);
            filled += Number(item.shot.durationSec) || 0;

            if (filled >= target) {
                break;
            }
        }

        if (filled < target) {
            const remaining = [...shots].sort((a, b) => a.index - b.index);

            for (const shot of remaining) {
                if (filled >= target) {
                    break;
                }

                if (used.has(Number(shot.index))) {
                    continue;
                }

                picked.push({
                    index: Number(shot.index),
                    sequence: 99,
                    match: 0,
                    shot
                });
                used.add(Number(shot.index));
                filled += Number(shot.durationSec) || 0;
            }
        }

        if (picked.length === 0 && shots.length > 0) {
            const middle = shots[Math.floor(shots.length / 2)];
            picked.push({
                index: Number(middle.index),
                sequence: 1,
                match: 0,
                shot: middle
            });
        }

        picked.sort((a, b) => a.sequence - b.sequence || a.index - b.index);

        return {
            picked,
            filled
        };
    }

    async selectEvent({
        eventDir,
        event,
        shots,
        durationSec
    }) {
        const candidates = this.pickThumbs(shots);
        const request = ShotSelectionPromptBuilder.build({
            event,
            shots: candidates,
            durationSec
        });

        const images = [];

        for (const shot of candidates) {
            if (!shot.thumb || !fs.existsSync(shot.thumb)) {
                continue;
            }

            images.push({
                label: `Shot ${shot.index} (${Number(shot.durationSec || 0).toFixed(2)}s):`,
                path: shot.thumb,
                mimeType: "image/jpeg"
            });
        }

        if (images.length === 0) {
            throw new Error(
                `No thumbnails found for ${event.id}`
            );
        }

        let parsed = { shots: [] };

        try {
            const raw = await GeminiService.generateJson({
                images,
                system: request.system,
                user: request.user,
                timeoutMs: 1000 * 60 * 3,
                disableThinking: true
            });

            parsed = this.parseResponse(raw);
        } catch (error) {
            console.log(
                `[ShotSelection] Gemini failed for ${event.id}: ${error.message}`
            );
        }

        const { picked, filled } = this.pickByMatch({
            parsed,
            shots: candidates,
            durationSec
        });

        const assembledPath = path.join(eventDir, "assembled.mp4");

        await FFmpegService.concatenateFiles({
            inputPaths: picked.map((item) => item.shot.path),
            outputPath: assembledPath,
            withAudio: false
        });

        const payload = {
            event_id: event.id,
            narration_script: event.narration_script || event.storyText,
            visual_description: event.visual_description,
            voice_duration_sec: durationSec,
            assembled_duration_sec: filled,
            selected_shots: picked.map((item) => item.index),
            match_scores: picked.map((item) => ({
                shot: item.index,
                sequence: item.sequence,
                match: item.match,
                durationSec: item.shot.durationSec
            })),
            assembled: assembledPath,
            shots: picked.map((item) => ({
                index: item.index,
                file: item.shot.file,
                path: item.shot.path
            }))
        };

        await fs.promises.writeFile(
            path.join(eventDir, "selected.json"),
            JSON.stringify(payload, null, 2),
            "utf-8"
        );

        return payload;
    }

    async writeManifest(jobId, recap) {
        const manifestPath = path.join(
            StorageService.getPaths(jobId).events,
            "shot_manifest.json"
        );

        await fs.promises.writeFile(
            manifestPath,
            JSON.stringify(
                {
                    recap
                },
                null,
                2
            ),
            "utf-8"
        );

        return manifestPath;
    }

}

module.exports = new ShotSelectionService();
