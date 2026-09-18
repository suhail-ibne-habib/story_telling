const path = require("path");
const fs = require("fs");

const EventBus = require("../core/EventBus");
const events = require("../events/events");

const StorageService = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const VoiceoverService = require("../services/VoiceoverService");
const FFprobeService = require("../services/FFprobeService");
const JobService = require("../services/JobService");

const STAGES = require("../constance/pipelineStages");

EventBus.subscribe(

    events.SHOT_SELECTION_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== VOICEOVER WORKER =========="
            );

            console.log(
                `[Voiceover] Job ID: ${jobId}`
            );

            const paths = StorageService.getPaths(jobId);

            await fs.promises.mkdir(paths.voice, { recursive: true });
            await fs.promises.mkdir(paths.output, { recursive: true });

            const voicedDir = path.join(paths.voice, "clips");
            const workRoot = path.join(paths.voice, "lock");

            await fs.promises.mkdir(voicedDir, { recursive: true });
            await fs.promises.mkdir(workRoot, { recursive: true });

            await ProgressService.startStage(
                jobId,
                STAGES.VOICEOVER
            );

            const {
                recapScenes,
                recapClips
            } = await VoiceoverService.loadJob(jobId);

            const recapById = new Map(
                recapClips.map((clip) => [clip.id, clip])
            );

            const voicedClips = [];
            const voices = [];

            for (const scene of recapScenes) {
                const clip = recapById.get(scene.id);

                if (!clip) {
                    throw new Error(`No assembled shots found for ${scene.id}`);
                }

                const text = scene.narration_script || scene.storyText;
                const voicePath = path.join(
                    paths.voice,
                    VoiceoverService.voiceFileName(scene.id)
                );

                if (!fs.existsSync(voicePath)) {
                    console.log(
                        `[Voiceover] Speaking ${scene.id}`
                    );

                    await VoiceoverService.generateVoice({
                        id: scene.id,
                        text,
                        voiceDir: paths.voice
                    });
                }

                const durationSec = await FFprobeService.durationSeconds(voicePath);

                voices.push({
                    id: scene.id,
                    path: voicePath,
                    storyText: text,
                    durationSec
                });

                const outputPath = path.join(
                    voicedDir,
                    `${scene.id}_voiced.mp4`
                );

                console.log(
                    `[Voiceover] Locking ${scene.id} to ${durationSec.toFixed(2)}s`
                );

                const voiced = await VoiceoverService.buildVoiceLockedClip({
                    assembledPath: clip.path,
                    eventDir: StorageService.getEventDir(jobId, scene.id),
                    voicePath,
                    durationSec,
                    workDir: path.join(workRoot, scene.id),
                    outputPath
                });

                voicedClips.push({
                    id: scene.id,
                    title: scene.story_arc || scene.title,
                    path: voiced.path,
                    file: path.basename(voiced.path),
                    speed_multiplier: voiced.speed_multiplier
                });
            }

            const recap = await VoiceoverService.assembleVoicedRecap({
                voicedClips,
                recapIds: recapScenes.map((scene) => scene.id),
                outputDir: paths.output
            });

            await fs.promises.writeFile(
                path.join(paths.voice, "voice_manifest.json"),
                JSON.stringify(
                    {
                        voices,
                        recap: {
                            outputPath: recap.outputPath,
                            clipCount: recap.clipCount
                        }
                    },
                    null,
                    2
                ),
                "utf-8"
            );

            await ProgressService.completeStage(
                jobId,
                STAGES.VOICEOVER
            );

            await ProgressService.completeJob(jobId);
            JobService.complete(jobId);

            console.log(
                `[Voiceover] Recap with voice: ${recap.outputPath}`
            );

            EventBus.publish(
                events.VOICEOVER_COMPLETED,
                { jobId }
            );

            console.log(
                "=====================================\n"
            );

        } catch (error) {

            console.error(
                "[Voiceover] Worker failed:",
                error
            );

            try {

                await ProgressService.failStage(
                    jobId,
                    STAGES.VOICEOVER,
                    error.message
                );

                JobService.fail(jobId, error.message);

            } catch (progressError) {

                console.error(
                    "[Voiceover] Failed to update progress:",
                    progressError
                );

            }

            EventBus.publish(
                events.VOICEOVER_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );

        }

    }

);
