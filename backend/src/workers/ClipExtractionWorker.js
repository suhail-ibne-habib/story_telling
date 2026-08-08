const EventBus = require("../core/EventBus");
const events = require("../events/events");
const Storage = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const ClipExtractionService = require("../services/ClipExtractionService");
const STAGES = require("../constance/pipelineStages");
const path = require("path");
const fs = require("fs");
const JobService = require("../services/JobService");


EventBus.subscribe(
    events.CLIP_PLANNING_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "Clip Extraction Worker is running..."
            );

            await ProgressService.startStage(
                jobId,
                STAGES.CLIP_EXTRACTION
            );


            const paths = Storage.getPaths(jobId);

            /*
             * Source movie
             */

            const moviePath = Storage.getInputMovie("Bride of Chucky.webm")

            console.log("Movie Path: ", moviePath)


            /*
             * Clip plan
             */

            const clipPlanPath =
                path.join(
                    paths.metadata,
                    "clip_plan.json"
                );


            console.log(
                "[ClipExtraction] Reading clip plan..."
            );


            const clipPlanRaw =
                await fs.promises.readFile(
                    clipPlanPath,
                    "utf-8"
                );


            const clipPlan =
                JSON.parse(clipPlanRaw);


            if (
                !clipPlan.clips ||
                !clipPlan.clips.length
            ) {

                throw new Error(
                    "No clips found in clip_plan.json"
                );

            }


            /*
             * Output directory
             */

            const outputDirectory =
                path.join(
                    paths.root,
                    "clips"
                );


            await fs.promises.mkdir(
                outputDirectory,
                {
                    recursive: true
                }
            );


            console.log({
                clipCount:
                    clipPlan.clips.length
            });


            /*
             * Extract clips one by one
             */

            for (const clip of clipPlan.clips) {

                console.log(
                    `\n[ClipExtraction] Processing ${clip.id}`
                );


                /*
                 * Resume check
                 */

                const completed =
                    await ProgressService.isClipCompleted(
                        jobId,
                        STAGES.CLIP_EXTRACTION,
                        clip.id
                    );


                if (completed) {

                    console.log(
                        `[ClipExtraction] Skipping completed clip ${clip.id}`
                    );

                    continue;
                }


                const outputPath =
                    path.join(
                        outputDirectory,
                        `${clip.id}.mp4`
                    );


                /*
                 * File-level safety check
                 */

                // if (
                //     fs.existsSync(outputPath)
                // ) {

                //     console.log(
                //         `[ClipExtraction] Output already exists: ${clip.id}`
                //     );

                //     await ProgressService.completeClip(
                //         jobId,
                //         STAGES.CLIP_EXTRACTION,
                //         clip.id
                //     );

                //     continue;
                // }


                /*
                 * Extract
                 */

                await ClipExtractionService.extract({

                    inputPath:
                        moviePath,

                    outputPath,

                    start:
                        clip.start,

                    end:
                        clip.end

                });


                /*
                 * Mark completed
                 */

                await ProgressService.completeClip(
                    jobId,
                    STAGES.CLIP_EXTRACTION,
                    clip.id
                );


                console.log(
                    `[ClipExtraction] ${clip.id} completed`
                );

            }


            /*
             * Stage completed
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.CLIP_EXTRACTION
            );


            console.log(
                "Clip Extraction Completed"
            );


            EventBus.publish(
                events.CLIP_EXTRACTION_COMPLETED,
                {
                    jobId
                }
            );


        } catch (error) {

            console.error(
                "Clip Extraction Worker Failed",
                error
            );


            await ProgressService.failStage(
                jobId,
                STAGES.CLIP_EXTRACTION,
                error.message
            );


            EventBus.publish(
                events.CLIP_EXTRACTION_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );

        }

    }
);