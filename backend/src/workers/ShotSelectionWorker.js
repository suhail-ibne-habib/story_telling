const path = require("path");
const fs = require("fs");

const EventBus = require("../core/EventBus");
const events = require("../events/events");

const StorageService = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const ShotDetectionService = require("../services/ShotDetectionService");
const ShotSelectionService = require("../services/ShotSelectionService");
const VoiceoverService = require("../services/VoiceoverService");
const FFprobeService = require("../services/FFprobeService");
const JobService = require("../services/JobService");

const STAGES = require("../constance/pipelineStages");

EventBus.subscribe(

    events.SHOT_DETECTION_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== SHOT SELECTION WORKER =========="
            );

            console.log(
                `[ShotSelection] Job ID: ${jobId}`
            );

            const recap = await ShotDetectionService.loadEvents(jobId);
            const paths = StorageService.getPaths(jobId);

            await fs.promises.mkdir(paths.voice, { recursive: true });

            await ProgressService.startStage(
                jobId,
                STAGES.SHOT_SELECTION
            );

            const assembled = [];

            for (const scene of recap) {

                const eventDir = StorageService.getEventDir(jobId, scene.id);
                const shotsPath = path.join(eventDir, "shots.json");
                const selectedPath = path.join(eventDir, "selected.json");
                const assembledPath = path.join(eventDir, "assembled.mp4");
                const voicePath = path.join(
                    paths.voice,
                    VoiceoverService.voiceFileName(scene.id)
                );

                if (!fs.existsSync(shotsPath)) {
                    throw new Error(
                        `shots.json not found for ${scene.id}`
                    );
                }

                const text = scene.narration_script || scene.storyText;

                if (!fs.existsSync(voicePath)) {
                    console.log(
                        `[ShotSelection] Speaking ${scene.id}`
                    );

                    await VoiceoverService.generateVoice({
                        id: scene.id,
                        text,
                        voiceDir: paths.voice
                    });
                }

                const durationSec = await FFprobeService.durationSeconds(voicePath);

                const saved = fs.existsSync(selectedPath)
                    ? JSON.parse(await fs.promises.readFile(selectedPath, "utf-8"))
                    : null;

                const alreadyScored =
                    saved?.voice_duration_sec &&
                    Array.isArray(saved.match_scores) &&
                    fs.existsSync(assembledPath) &&
                    Math.abs(saved.voice_duration_sec - durationSec) < 0.25;

                if (alreadyScored) {
                    console.log(
                        `[ShotSelection] ${scene.id} already scored. Skipping.`
                    );

                    assembled.push({
                        id: scene.id,
                        scene_id: scene.scene_id,
                        title: scene.story_arc || scene.title,
                        narration_script: scene.narration_script,
                        visual_description: scene.visual_description,
                        selected_shots: saved.selected_shots,
                        file: "assembled.mp4",
                        path: assembledPath
                    });

                    continue;
                }

                const shotData = JSON.parse(
                    await fs.promises.readFile(shotsPath, "utf-8")
                );

                console.log(
                    `[ShotSelection] ${scene.id}: ${shotData.shots.length} shots for ${durationSec.toFixed(1)}s voice`
                );

                const selected = await ShotSelectionService.selectEvent({
                    eventDir,
                    event: scene,
                    shots: shotData.shots,
                    durationSec
                });

                assembled.push({
                    id: scene.id,
                    scene_id: scene.scene_id,
                    title: scene.story_arc || scene.title,
                    narration_script: scene.narration_script,
                    visual_description: scene.visual_description,
                    selected_shots: selected.selected_shots,
                    file: "assembled.mp4",
                    path: selected.assembled
                });

                await ProgressService.completeChunk(
                    jobId,
                    STAGES.SHOT_SELECTION,
                    scene.id
                );
            }

            await ShotSelectionService.writeManifest(jobId, assembled);

            await ProgressService.completeStage(
                jobId,
                STAGES.SHOT_SELECTION
            );

            console.log(
                `[ShotSelection] Assembled ${assembled.length} events`
            );

            EventBus.publish(
                events.SHOT_SELECTION_COMPLETED,
                { jobId }
            );

            console.log(
                "==========================================\n"
            );

        } catch (error) {

            console.error(
                "[ShotSelection] Worker failed:",
                error
            );

            try {

                await ProgressService.failStage(
                    jobId,
                    STAGES.SHOT_SELECTION,
                    error.message
                );

                JobService.fail(jobId, error.message);

            } catch (progressError) {

                console.error(
                    "[ShotSelection] Failed to update progress:",
                    progressError
                );

            }

            EventBus.publish(
                events.SHOT_SELECTION_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );

        }

    }

);
