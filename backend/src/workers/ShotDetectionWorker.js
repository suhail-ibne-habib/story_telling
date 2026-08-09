const fs = require("fs");
const path = require("path");

const EventBus = require("../core/EventBus");
const events = require("../events/events");

const StorageService = require("../../storage/StorageService");

const ShotDetectionService = require(
    "../services/ShotDetectionService"
);

const ProgressService = require(
    "../services/ProgressService"
);

const GetFileName = require(
    "../core/GetFileName"
);

const STAGES = require(
    "../constance/pipelineStages"
);


EventBus.subscribe(

    events.TRANSCRIPT_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== SHOT DETECTION WORKER =========="
            );

            console.log(
                `[ShotDetection] Job ID: ${jobId}`
            );


            /*
             * 1. Start stage
             *
             * ProgressService is responsible for
             * tracking the current stage and resume state.
             */

            await ProgressService.startStage(
                jobId,
                STAGES.SHOTS
            );


            /*
             * 2. Get storage paths
             */

            const paths =
                StorageService.getPaths(jobId);


            /*
             * 3. Make sure shots directory exists
             */

            await fs.promises.mkdir(
                paths.shots,
                {
                    recursive: true
                }
            );


            /*
             * 4. Resolve filename
             *
             * Normal run:
             *      JobService -> filename
             *
             * Resume:
             *      ProgressService -> filename
             *
             * The worker doesn't need to know
             * where the filename came from.
             */

            const filename =
                await GetFileName.getFileName(jobId);


            if (!filename) {

                throw new Error(
                    `Filename could not be resolved for job: ${jobId}`
                );

            }


            console.log(
                `[ShotDetection] Movie filename: ${filename}`
            );


            /*
             * 5. Resolve original movie
             */

            const inputMovie =
                StorageService.getInputMovie(
                    filename
                );


            console.log(
                "[ShotDetection] Input movie:",
                inputMovie
            );


            /*
             * 6. Verify movie exists
             */

            if (
                !fs.existsSync(inputMovie)
            ) {

                throw new Error(
                    `Input movie not found: ${inputMovie}`
                );

            }


            /*
             * 7. Detect shots
             */

            console.log(
                "[ShotDetection] Detecting shots..."
            );


            const shots =
                await ShotDetectionService.detect(
                    inputMovie
                );


            /*
             * 8. Validate result
             */

            if (
                !Array.isArray(shots)
            ) {

                throw new Error(
                    "ShotDetectionService returned an invalid result."
                );

            }


            if (
                shots.length === 0
            ) {

                throw new Error(
                    "ShotDetectionService detected zero shots."
                );

            }


            console.log(
                `[ShotDetection] Detected ${shots.length} shots`
            );


            /*
             * 9. Save shots
             */

            const shotFile =
                path.join(
                    paths.shots,
                    "shots.json"
                );


            await fs.promises.writeFile(

                shotFile,

                JSON.stringify(
                    shots,
                    null,
                    2
                ),

                "utf-8"

            );


            console.log(
                `[ShotDetection] Saved shots: ${shotFile}`
            );


            /*
             * 10. Complete stage
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.SHOTS
            );


            console.log(
                "[ShotDetection] Stage completed."
            );


            /*
             * 11. Trigger next stage
             */

            EventBus.publish(

                events.SHOTS_COMPLETED,

                {
                    jobId
                }

            );


            console.log(
                "==========================================\n"
            );


        } catch (error) {

            console.error(
                "[ShotDetection] Worker failed:",
                error
            );


            /*
             * Mark stage as failed
             */

            try {

                await ProgressService.failStage(

                    jobId,

                    STAGES.SHOTS,

                    error.message

                );

            } catch (progressError) {

                console.error(
                    "[ShotDetection] Failed to update progress:",
                    progressError
                );

            }


            /*
             * Notify pipeline
             */

            EventBus.publish(

                events.SHOTS_FAILED,

                {
                    jobId,
                    error: error.message
                }

            );

        }

    }

);