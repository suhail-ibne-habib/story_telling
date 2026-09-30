const fs = require("fs");
const path = require("path");

const StorageService = require("../../storage/StorageService");
const VoiceGenerationService = require("./VoiceGenerationService");
const FFprobeService = require("./FFprobeService");
const RecapService = require("./RecapService");
const { readJson, writeJson } = require("../utils/jsonFile");

function spokenText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}

function relative(jobId, filePath) {
    return path.relative(StorageService.getPaths(jobId).root, filePath).replace(/\\/g, "/");
}

class VoiceoverService {

    voicePaths(jobId, angle) {
        const voiceDir = StorageService.getPaths(jobId).voice;

        return {
            dir: path.join(voiceDir, angle),
            manifest: path.join(voiceDir, `${angle}.json`)
        };
    }

    async loadAngle(jobId, angle) {
        return readJson(this.voicePaths(jobId, angle).manifest);
    }

    async synthesize(jobId) {
        const manifest = await RecapService.loadManifest(jobId);

        if (!manifest?.angles?.length) {
            throw new Error("No recap found. Run the recap stage first.");
        }

        const results = [];

        for (const angle of manifest.angles) {
            const recap = await RecapService.loadAngle(jobId, angle);
            const files = this.voicePaths(jobId, angle);

            await fs.promises.mkdir(files.dir, { recursive: true });

            const beats = [];

            for (const beat of recap.beats) {
                const spoken = spokenText(beat.text);
                const audioPath = path.join(files.dir, `${beat.beat_id}.mp3`);

                console.log(`[TTS] ${angle} ${beat.beat_id} (${spoken.length} chars)`);

                await VoiceGenerationService.generate({ text: spoken, outputPath: audioPath });
                const durationSec = await FFprobeService.durationSeconds(audioPath);

                beats.push({
                    ...beat,
                    spoken_text: spoken,
                    audio: relative(jobId, audioPath),
                    duration_sec: Number(durationSec.toFixed(3))
                });
            }

            const payload = {
                angle,
                label: recap.label,
                title: recap.title,
                story: recap.story,
                beats
            };

            await writeJson(files.manifest, payload);
            results.push(payload);
        }

        return results;
    }

    async isDone(jobId) {
        const manifest = await RecapService.loadManifest(jobId).catch(() => null);

        if (!manifest?.angles?.length) {
            return false;
        }

        const root = StorageService.getPaths(jobId).root;

        for (const angle of manifest.angles) {
            const recap = await RecapService.loadAngle(jobId, angle).catch(() => null);
            const voice = await this.loadAngle(jobId, angle).catch(() => null);

            const ready = recap && voice &&
                voice.story === recap.story &&
                voice.beats?.length === recap.beats.length &&
                voice.beats.every((beat) => (
                    beat.duration_sec > 0 && fs.existsSync(path.join(root, beat.audio))
                ));

            if (!ready) {
                return false;
            }
        }

        return true;
    }
}

module.exports = new VoiceoverService();
