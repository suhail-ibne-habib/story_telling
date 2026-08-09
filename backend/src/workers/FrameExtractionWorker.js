const fs = require("fs");
const path = require("path");

const EventBus = require("../core/EventBus");
const events = require("../events/events");

const StorageService = require("../../storage/StorageService");

const FrameExtractionService = require(
    "../services/FrameExtractionService"
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

    events.SHOTS_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== FRAME EXTRACTION WORKER =========="
            );

            console.log(
                `[FrameExtraction] Job ID: ${jobId}`
            );


            /*
             * 1. Start stage
             *
             * ProgressService is responsible for
             * tracking the stage state.
             */

            await ProgressService.startStage(
                jobId,
                STAGES.FRAMES
            );


            /*
             * 2. Get storage paths
             */

            const paths =
                StorageService.getPaths(jobId);


            /*
             * 3. Make sure frames directory exists
             */

            await fs.promises.mkdir(
                paths.frames,
                {
                    recursive: true
                }
            );


            /*
             * 4. Read shots.json
             *
             * This is an input requirement for
             * Frame Extraction.
             */

            const shotsFile =
                path.join(
                    paths.shots,
                    "shots.json"
                );


            if (
                !fs.existsSync(shotsFile)
            ) {

                throw new Error(
                    `shots.json not found: ${shotsFile}`
                );

            }


            const shotsRaw =
                await fs.promises.readFile(
                    shotsFile,
                    "utf-8"
                );


            const shots =
                JSON.parse(shotsRaw);


            if (
                !Array.isArray(shots) ||
                shots.length === 0
            ) {

                throw new Error(
                    "No shots found in shots.json"
                );

            }


            console.log(
                `[FrameExtraction] Loaded ${shots.length} shots`
            );


            /*
             * 5. Get filename
             *
             * Normal run:
             * JobService -> filename
             *
             * Resume:
             * ProgressService -> filename
             *
             * The worker doesn't care where it came from.
             */

            const filename =
                await GetFileName.getFileName(jobId);


            if (!filename) {

                throw new Error(
                    `Filename could not be resolved for job: ${jobId}`
                );

            }


            console.log(
                `[FrameExtraction] Movie filename: ${filename}`
            );


            /*
             * 6. Resolve input movie
             */

            const inputMovie =
                StorageService.getInputMovie(
                    filename
                );


            console.log(
                "[FrameExtraction] Input movie:",
                inputMovie
            );


            /*
             * 7. Verify input movie
             */

            if (
                !fs.existsSync(inputMovie)
            ) {

                throw new Error(
                    `Input movie not found: ${inputMovie}`
                );

            }


            /*
             * 8. Extract frames
             */

            console.log(
                "[FrameExtraction] Extracting frames..."
            );


            const extractedShots =
                await FrameExtractionService.extract(

                    inputMovie,

                    shots,

                    paths.frames

                );


            /*
             * 9. Validate extraction result
             */

            if (
                !Array.isArray(extractedShots)
            ) {

                throw new Error(
                    "FrameExtractionService returned invalid data."
                );

            }


            /*
             * 10. Save frames.json
             */

            const framesFile =
                path.join(
                    paths.frames,
                    "frames.json"
                );


            await fs.promises.writeFile(

                framesFile,

                JSON.stringify(
                    extractedShots,
                    null,
                    2
                ),

                "utf-8"

            );


            /*
             * 11. Calculate statistics
             */

            const totalFrames =
                extractedShots.reduce(

                    (total, shot) => {

                        return (
                            total +
                            (
                                Array.isArray(shot.frames)
                                    ? shot.frames.length
                                    : 0
                            )
                        );

                    },

                    0

                );


            console.log(
                `[FrameExtraction] Extracted ${totalFrames} frames from ${extractedShots.length} shots`
            );


            console.log(
                `[FrameExtraction] Saved frames: ${framesFile}`
            );


            /*
             * 12. Complete stage
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.FRAMES
            );


            console.log(
                "[FrameExtraction] Frame extraction stage completed."
            );


            /*
             * 13. Trigger next stage
             */

            EventBus.publish(

                events.FRAMES_COMPLETED,

                {
                    jobId
                }

            );


            console.log(
                "============================================\n"
            );


        } catch (error) {

            console.error(
                "[FrameExtraction] Worker failed:",
                error
            );


            /*
             * Mark stage as failed
             */

            try {

                await ProgressService.failStage(

                    jobId,

                    STAGES.FRAMES,

                    error.message

                );

            } catch (progressError) {

                console.error(
                    "[FrameExtraction] Failed to update progress:",
                    progressError
                );

            }


            /*
             * Notify pipeline
             */

            EventBus.publish(

                events.FRAMES_FAILED,

                {
                    jobId,
                    error: error.message
                }

            );

        }

    }

);