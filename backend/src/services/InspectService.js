const fs = require("fs");
const path = require("path");

const StorageService = require("../../storage/StorageService");

function readJsonSync(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (_error) {
        return null;
    }
}

function mediaUrl(jobId, relativePath) {
    return relativePath
        ? `/job-files/${jobId}/${String(relativePath).replace(/\\/g, "/")}`
        : null;
}

class InspectService {

    listJobs() {
        if (!fs.existsSync(StorageService.root)) {
            return [];
        }

        return fs.readdirSync(StorageService.root, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => {
                const jobId = entry.name;
                const paths = StorageService.getPaths(jobId);
                const progress = readJsonSync(path.join(paths.root, "progress.json")) || {};
                const manifest = readJsonSync(path.join(paths.recap, "recaps.json"));

                return {
                    jobId,
                    title: progress.title || manifest?.title || null,
                    filename: progress.filename || null,
                    status: progress.status || null,
                    currentStage: progress.currentStage || null,
                    available: {
                        recap: Boolean(manifest),
                        video: fs.existsSync(path.join(paths.output, "videos.json"))
                    }
                };
            })
            .sort((a, b) => b.jobId.localeCompare(a.jobId));
    }

    loadJob(jobId) {
        const paths = StorageService.getPaths(jobId);

        if (!fs.existsSync(paths.root)) {
            return null;
        }

        const progress = readJsonSync(path.join(paths.root, "progress.json")) || {};
        const manifest = readJsonSync(path.join(paths.recap, "recaps.json"));
        const videos = readJsonSync(path.join(paths.output, "videos.json"))?.videos || [];

        const angles = (manifest?.angles || []).map((angle) => {
            const recap = readJsonSync(path.join(paths.recap, `${angle}.json`));
            const voice = readJsonSync(path.join(paths.voice, `${angle}.json`));
            const cut = readJsonSync(path.join(paths.cut, `${angle}.json`));
            const video = videos.find((item) => item.angle === angle);
            const voiceById = new Map((voice?.beats || []).map((beat) => [beat.beat_id, beat]));
            const cutById = new Map((cut?.beats || []).map((beat) => [beat.beat_id, beat]));

            return {
                angle,
                label: recap?.label || angle,
                title: recap?.title || null,
                story: cut?.final_story || recap?.story || null,
                video: video ? mediaUrl(jobId, video.file) : null,
                needs_review: cut?.needs_review || [],
                beats: (recap?.beats || []).map((beat) => {
                    const voiced = voiceById.get(beat.beat_id);
                    const clipped = cutById.get(beat.beat_id);

                    return {
                        beat_id: beat.beat_id,
                        text: clipped?.text || beat.text,
                        original_text: beat.text,
                        rewritten: Boolean(clipped?.rewritten),
                        shows: beat.shows || null,
                        moments: beat.moments || [],
                        scenes: beat.scenes,
                        duration_sec: clipped?.duration_sec || voiced?.duration_sec || null,
                        audio: mediaUrl(jobId, clipped?.audio || voiced?.audio),
                        chosen: clipped?.chosen || null,
                        parts: clipped?.parts || [],
                        tried: clipped?.tried || [],
                        needs_review: Boolean(clipped?.needs_review),
                        clip: mediaUrl(jobId, clipped?.clip)
                    };
                })
            };
        });

        return {
            jobId,
            title: progress.title || manifest?.title || null,
            filename: progress.filename || null,
            status: progress.status || null,
            currentStage: progress.currentStage || null,
            angles
        };
    }
}

module.exports = new InspectService();
