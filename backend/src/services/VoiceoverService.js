const path = require("path");
const fs = require("fs");

const StorageService = require("../../storage/StorageService");
const VoiceGenerationService = require("./VoiceGenerationService");
const FFmpegService = require("./FFmpegService");
const FFprobeService = require("./FFprobeService");

class VoiceoverService {

    async loadJob(jobId) {
        const paths = StorageService.getPaths(jobId);
        const eventsPath = path.join(paths.events, "events.json");
        const manifestPath = path.join(paths.events, "shot_manifest.json");

        if (!fs.existsSync(eventsPath)) {
            throw new Error(`events.json not found: ${eventsPath}`);
        }

        if (!fs.existsSync(manifestPath)) {
            throw new Error(`shot_manifest.json not found: ${manifestPath}`);
        }

        const eventsData = JSON.parse(
            await fs.promises.readFile(eventsPath, "utf-8")
        );
        const shotManifest = JSON.parse(
            await fs.promises.readFile(manifestPath, "utf-8")
        );

        const recapScenes = Array.isArray(eventsData.full_recap)
            ? eventsData.full_recap
            : [];

        const recapClips = Array.isArray(shotManifest.recap)
            ? shotManifest.recap
            : [];

        if (recapScenes.length === 0) {
            throw new Error("No full_recap scenes with narration were found.");
        }

        if (recapClips.length === 0) {
            throw new Error("No assembled recap shots were found.");
        }

        return {
            paths,
            recapScenes,
            recapClips
        };
    }

    voiceFileName(id) {
        return `${id}.mp3`;
    }

    async generateVoice({
        id,
        text,
        voiceDir
    }) {
        const fileName = this.voiceFileName(id);
        const outputPath = path.join(voiceDir, fileName);

        await VoiceGenerationService.generate({
            text,
            outputPath
        });

        return {
            id,
            file: fileName,
            path: outputPath,
            storyText: text
        };
    }

    async fillFootageToVoice({
        assembledPath,
        eventDir,
        durationSec,
        workDir
    }) {
        let videoDuration = await FFprobeService.durationSeconds(assembledPath);

        if (videoDuration >= durationSec * 0.95) {
            return assembledPath;
        }

        const shotsPath = path.join(eventDir, "shots.json");
        const selectedPath = path.join(eventDir, "selected.json");

        if (!fs.existsSync(shotsPath) || !fs.existsSync(selectedPath)) {
            return assembledPath;
        }

        const shotData = JSON.parse(
            await fs.promises.readFile(shotsPath, "utf-8")
        );
        const selected = JSON.parse(
            await fs.promises.readFile(selectedPath, "utf-8")
        );

        const allShots = Array.isArray(shotData.shots) ? shotData.shots : [];
        const selectedIndexes = (selected.selected_shots || []).map((index) => Number(index));
        const used = new Set(selectedIndexes);

        const usable = allShots
            .filter((shot) => (
                shot.path &&
                fs.existsSync(shot.path) &&
                Number(shot.durationSec) >= 0.2
            ))
            .sort((a, b) => a.index - b.index);

        if (usable.length === 0) {
            return assembledPath;
        }

        const picked = usable.filter((shot) => used.has(Number(shot.index)));
        let filled = picked.reduce(
            (sum, shot) => sum + (Number(shot.durationSec) || 0),
            0
        );

        for (const shot of usable) {
            if (filled >= durationSec) {
                break;
            }

            if (used.has(Number(shot.index))) {
                continue;
            }

            picked.push(shot);
            used.add(Number(shot.index));
            filled += Number(shot.durationSec) || 0;
        }

        picked.sort((a, b) => a.index - b.index);

        if (picked.length === 0) {
            return assembledPath;
        }

        const filledPath = path.join(workDir, "filled.mp4");

        await FFmpegService.concatenateFiles({
            inputPaths: picked.map((shot) => shot.path),
            outputPath: filledPath,
            withAudio: false
        });

        const filledDuration = await FFprobeService.durationSeconds(filledPath);

        console.log(
            `[Voiceover] Filled footage ${videoDuration.toFixed(1)}s → ${filledDuration.toFixed(1)}s`
        );

        return filledPath;
    }

    async buildVoiceLockedClip({
        assembledPath,
        voicePath,
        durationSec,
        workDir,
        outputPath,
        eventDir
    }) {
        await fs.promises.mkdir(workDir, { recursive: true });

        let videoPath = assembledPath;

        if (eventDir) {
            videoPath = await this.fillFootageToVoice({
                assembledPath,
                eventDir,
                durationSec,
                workDir
            });
        }

        const videoDuration = await FFprobeService.durationSeconds(videoPath);
        let speed = 1;

        if (videoDuration > durationSec * 1.02) {
            speed = Math.min(1.5, videoDuration / durationSec);

            const spedPath = path.join(workDir, "sped.mp4");

            await FFmpegService.speedVideo({
                inputPath: videoPath,
                outputPath: spedPath,
                speed
            });

            videoPath = spedPath;
        }

        await FFmpegService.mixVoiceLocked({
            videoPath,
            voicePath,
            outputPath,
            durationSec
        });

        if (!fs.existsSync(outputPath)) {
            throw new Error(
                `Voice-locked clip was not created: ${outputPath}`
            );
        }

        return {
            path: outputPath,
            speed_multiplier: speed
        };
    }

    async assembleVoicedRecap({
        voicedClips,
        recapIds,
        outputDir
    }) {
        const recapClips = recapIds
            .map((id) => voicedClips.find((clip) => clip.id === id))
            .filter(Boolean);

        if (recapClips.length === 0) {
            throw new Error("No voiced recap clips to concatenate.");
        }

        const outputPath = path.join(
            outputDir,
            "recap_voiced.mp4"
        );

        await FFmpegService.concatenateFiles({
            inputPaths: recapClips.map((clip) => clip.path),
            outputPath,
            withAudio: true
        });

        return {
            outputPath,
            clipCount: recapClips.length,
            clips: recapClips
        };
    }

}

module.exports = new VoiceoverService();
