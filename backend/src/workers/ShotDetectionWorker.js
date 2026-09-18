const path = require("path");
const fs = require("fs");

const EventBus = require("../core/EventBus");
const events = require("../events/events");

const StorageService = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const ShotDetectionService = require("../services/ShotDetectionService");
const JobService = require("../services/JobService");

const STAGES = require("../constance/pipelineStages");

EventBus.subscribe(

    events.EVENT_EXTRACTION_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== SHOT DETECTION WORKER =========="
            );

            console.log(
                `[ShotDetection] Job ID: ${jobId}`
            );

            const recap = await ShotDetectionService.loadEvents(jobId);
            const progress = await ProgressService.load(jobId);
            const stage = progress?.stages?.[STAGES.SHOT_DETECTION];
            const allReady = recap.every((scene) => (
                fs.existsSync(
                    path.join(
                        StorageService.getEventDir(jobId, scene.id),
                        "shots.json"
                    )
                )
            ));

            if (
                stage?.status === "completed" &&
                allReady
            ) {

                console.log(
                    "[ShotDetection] Stage already completed. Skipping."
                );

                EventBus.publish(
                    events.SHOT_DETECTION_COMPLETED,
                    { jobId }
                );

                return;
            }

            await ProgressService.startStage(
                jobId,
                STAGES.SHOT_DETECTION
            );

            const inputPath = await ShotDetectionService.sourceMovie(jobId);

            console.log(
                `[ShotDetection] Source: ${inputPath}`
            );

            for (const scene of recap) {

                const shotsPath = path.join(
                    StorageService.getEventDir(jobId, scene.id),
                    "shots.json"
                );

                const alreadyDone = await ProgressService.isChunkCompleted(
                    jobId,
                    STAGES.SHOT_DETECTION,
                    scene.id
                );

                if (alreadyDone && fs.existsSync(shotsPath)) {
                    console.log(
                        `[ShotDetection] ${scene.id} already detected. Skipping.`
                    );
                    continue;
                }

                if (!scene.durationMs || scene.endMs <= scene.startMs) {
                    console.log(
                        `[ShotDetection] Skipping ${scene.id}: invalid window ${scene.start_time} → ${scene.end_time}`
                    );
                    continue;
                }

                console.log(
                    `[ShotDetection] ${scene.id} ${scene.start_time} → ${scene.end_time}`
                );

                const detected = await ShotDetectionService.detectEvent({
                    jobId,
                    inputPath,
                    scene
                });

                console.log(
                    `[ShotDetection] ${scene.id}: ${detected.shots.length} shots`
                );

                await ProgressService.completeChunk(
                    jobId,
                    STAGES.SHOT_DETECTION,
                    scene.id
                );
            }

            await ProgressService.completeStage(
                jobId,
                STAGES.SHOT_DETECTION
            );

            EventBus.publish(
                events.SHOT_DETECTION_COMPLETED,
                { jobId }
            );

            console.log(
                "==========================================\n"
            );

        } catch (error) {

            console.error(
                "[ShotDetection] Worker failed:",
                error
            );

            try {

                await ProgressService.failStage(
                    jobId,
                    STAGES.SHOT_DETECTION,
                    error.message
                );

                JobService.fail(jobId, error.message);

            } catch (progressError) {

                console.error(
                    "[ShotDetection] Failed to update progress:",
                    progressError
                );

            }

            EventBus.publish(
                events.SHOT_DETECTION_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );

        }

    }

);
