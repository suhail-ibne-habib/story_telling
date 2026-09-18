const { execFile } = require("child_process");
const util = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = util.promisify(execFile);

const StorageService = require("../../storage/StorageService");
const FFmpegService = require("./FFmpegService");
const FFprobeService = require("./FFprobeService");
const DownsampleService = require("./DownsampleService");
const EventExtractionService = require("./EventExtractionService");
const GetFileName = require("../core/GetFileName");

const PYTHON = process.env.PYTHON || "python";
const DETECT_SCRIPT = path.join(
    __dirname,
    "../../python",
    "detect_shots.py"
);

class ShotDetectionService {

    async loadEvents(jobId) {
        const eventsPath = path.join(
            StorageService.getPaths(jobId).events,
            "events.json"
        );

        if (!fs.existsSync(eventsPath)) {
            throw new Error(
                `events.json not found: ${eventsPath}`
            );
        }

        const parsed = JSON.parse(
            await fs.promises.readFile(eventsPath, "utf-8")
        );

        const recap = Array.isArray(parsed.full_recap)
            ? parsed.full_recap
            : [];

        if (recap.length === 0) {
            throw new Error("events.json has no full_recap scenes.");
        }

        const metadata = await DownsampleService.loadMetadata(jobId);
        const repaired = EventExtractionService.normalize(
            { full_recap: recap },
            metadata.duration
        );

        if (repaired.full_recap.length === 0) {
            throw new Error("events.json has no usable recap windows.");
        }

        const changed = repaired.full_recap.length !== recap.length ||
            repaired.full_recap.some((scene, index) => (
                scene.startMs !== recap[index]?.startMs ||
                scene.endMs !== recap[index]?.endMs
            ));

        if (changed) {
            await fs.promises.writeFile(
                eventsPath,
                JSON.stringify(repaired, null, 2),
                "utf-8"
            );

            await fs.promises.writeFile(
                path.join(
                    StorageService.getPaths(jobId).events,
                    "manifest.json"
                ),
                JSON.stringify(
                    EventExtractionService.toPublicManifest(repaired),
                    null,
                    2
                ),
                "utf-8"
            );

            console.log(
                `[ShotDetection] Repaired ${recap.length} events → ${repaired.full_recap.length} usable windows`
            );
        }

        return repaired.full_recap;
    }

    async sourceMovie(jobId) {
        const filename = await GetFileName.getFileName(jobId);
        const inputPath = StorageService.getInputMovie(filename);

        if (!fs.existsSync(inputPath)) {
            throw new Error(
                `Input movie not found: ${inputPath}`
            );
        }

        return inputPath;
    }

    eventDir(jobId, eventId) {
        return StorageService.getEventDir(jobId, eventId);
    }

    async detectEvent({
        jobId,
        inputPath,
        scene
    }) {
        const eventDir = this.eventDir(jobId, scene.id);
        const shotsDir = path.join(eventDir, "shots");
        const thumbsDir = path.join(eventDir, "thumbs");
        const scenePath = path.join(eventDir, "scene.mp4");
        const shotsJsonPath = path.join(eventDir, "shots.json");

        await fs.promises.mkdir(shotsDir, { recursive: true });
        await fs.promises.mkdir(thumbsDir, { recursive: true });

        await FFmpegService.cropClip({
            inputPath,
            outputPath: scenePath,
            startMs: scene.startMs,
            endMs: scene.endMs
        });

        let shots = [];

        try {
            const { stdout } = await execFileAsync(
                PYTHON,
                [
                    DETECT_SCRIPT,
                    "--input",
                    scenePath,
                    "--output-dir",
                    shotsDir
                ],
                {
                    maxBuffer: 10 * 1024 * 1024,
                    windowsHide: true
                }
            );

            const parsed = JSON.parse(String(stdout || "{}").trim() || "{}");
            shots = Array.isArray(parsed.shots) ? parsed.shots : [];
        } catch (error) {
            console.log(
                `[ShotDetection] PySceneDetect failed for ${scene.id}: ${error.message}`
            );
        }

        if (shots.length === 0) {
            const fallbackName = "shot_001.mp4";
            const fallbackPath = path.join(shotsDir, fallbackName);
            await fs.promises.copyFile(scenePath, fallbackPath);
            shots = [
                {
                    index: 1,
                    file: fallbackName,
                    start_sec: 0,
                    end_sec: (scene.durationMs || 0) / 1000
                }
            ];
        }

        const MIN_SHOT_SEC = 0.2;
        const detailed = [];

        for (const shot of shots) {
            const index = Number(shot.index);
            const file = shot.file;
            const shotPath = path.join(shotsDir, file);

            if (!fs.existsSync(shotPath)) {
                continue;
            }

            let metadata;

            try {
                metadata = await FFprobeService.extract(shotPath);
            } catch (error) {
                console.log(
                    `[ShotDetection] Skipping ${scene.id}/${file}: ${error.message}`
                );
                continue;
            }

            const durationSec = Number(metadata.duration);
            const hasVideo = Boolean(metadata.video);

            if (!hasVideo || !Number.isFinite(durationSec) || durationSec < MIN_SHOT_SEC) {
                console.log(
                    `[ShotDetection] Skipping ${scene.id}/${file}: ${hasVideo ? `${durationSec.toFixed(3)}s` : "no video stream"}`
                );
                continue;
            }

            const thumbName = `shot_${String(index).padStart(3, "0")}.jpg`;
            const thumbPath = path.join(thumbsDir, thumbName);
            const timeSec = Math.min(
                durationSec * 0.5,
                Math.max(0, durationSec - 0.04)
            );

            try {
                await FFmpegService.extractFrame({
                    inputPath: shotPath,
                    outputPath: thumbPath,
                    timeSec
                });
            } catch (error) {
                console.log(
                    `[ShotDetection] Skipping ${scene.id}/${file}: thumbnail failed (${error.message})`
                );
                continue;
            }

            if (!fs.existsSync(thumbPath)) {
                continue;
            }

            detailed.push({
                index,
                file,
                path: shotPath,
                thumb: thumbPath,
                start_sec: shot.start_sec,
                end_sec: shot.end_sec,
                durationSec
            });
        }

        if (detailed.length === 0) {
            throw new Error(
                `No shots were produced for ${scene.id}`
            );
        }

        const payload = {
            event_id: scene.id,
            scene: scenePath,
            start: scene.start_time,
            end: scene.end_time,
            narration_script: scene.narration_script,
            visual_description: scene.visual_description,
            shots: detailed
        };

        await fs.promises.writeFile(
            shotsJsonPath,
            JSON.stringify(payload, null, 2),
            "utf-8"
        );

        return payload;
    }

}

module.exports = new ShotDetectionService();
