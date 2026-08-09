const StorageService = require("../../storage/StorageService");
const EventBus = require("../core/EventBus");
const events = require("../events/events");

const JobService = require("../services/JobService");
const ProgressService = require("../services/ProgressService");
const FFprobeService = require("../services/FFprobeService");

const STAGES = require("../constance/pipelineStages");

const path = require("path");
const fs = require("fs");


EventBus.subscribe(

    events.MOVIE_REGISTERED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== METADATA WORKER STARTED =========="
            );

            /*
             * 3. Get storage paths
             */

            const paths = StorageService.getPaths(jobId);


            /*
             * 4. Make sure metadata directory exists
             */

            await fs.promises.mkdir(
                paths.metadata,
                {
                    recursive: true
                }
            );


            /*
             * 5. Metadata output file
             */

            const metadataFile =
                path.join(
                    paths.metadata,
                    "meta_data.json"
                );


            /*
             * 6. Check current progress
             *
             * If metadata is already completed,
             * don't run FFprobe again.
             */

            const progress = await ProgressService.load(jobId);
            const metadataStage = progress?.stages?.[STAGES.METADATA];


            if (
                metadataStage?.status === "completed"
            ) {

                console.log(
                    "[Metadata] Stage already completed. Skipping."
                );


                /*
                 * Continue pipeline
                 */

                EventBus.publish(
                    events.METADATA_COMPLETED,
                    {
                        jobId
                    }
                );


                return;

            }


            /*
             * 7. Start stage
             */

            await ProgressService.startStage(
                jobId,
                STAGES.METADATA
            );


            console.log(
                "[Metadata] Stage started."
            );

            /*
             * 9. Get input movie
             */

            const inputMoviePath =
                StorageService.getInputMovie(
                    job.filename
                );


            console.log(
                "[Metadata] Input movie:",
                inputMoviePath
            );


            /*
             * 10. Verify movie exists
             */

            if (
                !fs.existsSync(inputMoviePath)
            ) {

                throw new Error(
                    `Input movie not found: ${inputMoviePath}`
                );

            }


            /*
             * 11. Extract metadata
             */

            console.log(
                "[Metadata] Running FFprobe..."
            );


            const metadata =
                await FFprobeService.extract(
                    inputMoviePath
                );


            console.log(
                "[Metadata] FFprobe completed."
            );


            /*
             * 12. Save metadata
             */

            await fs.promises.writeFile(

                metadataFile,

                JSON.stringify(
                    metadata,
                    null,
                    2
                ),

                "utf-8"

            );


            console.log(
                `[Metadata] Saved: ${metadataFile}`
            );


            /*
             * 13. Mark stage completed
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.METADATA
            );


            console.log(
                "[Metadata] Stage completed."
            );


            /*
             * 14. Trigger next stage
             */

            EventBus.publish(

                events.METADATA_COMPLETED,

                {
                    jobId
                }

            );


            console.log(
                "====================================\n"
            );


        } catch (error) {

            console.error(
                "\n[Metadata] Worker failed:",
                error
            );


            /*
             * 15. Mark stage failed
             */

            try {

                await ProgressService.failStage(
                    jobId,
                    STAGES.METADATA,
                    error.message
                );

            } catch (progressError) {

                console.error(
                    "[Metadata] Failed to update progress:",
                    progressError
                );

            }


            /*
             * 16. Notify pipeline
             */

            EventBus.publish(

                events.METADATA_FAILED,

                {
                    jobId,
                    error: error.message
                }

            );

        }

    }

);