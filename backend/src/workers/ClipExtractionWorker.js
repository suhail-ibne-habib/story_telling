const EventBus =
    require("../core/EventBus");

const events =
    require("../events/events");

const Storage =
    require("../../storage/StorageService");

const ProgressService =
    require("../services/ProgressService");

const ClipExtractionService =
    require("../services/ClipExtractionService");

const STAGES =
    require("../constance/pipelineStages");

const path =
    require("path");

const fs =
    require("fs");


EventBus.subscribe(
    events.SHOT_MAPPING_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n=========================================="
            );

            console.log(
                "Clip Extraction Worker is running..."
            );

            console.log(
                "Job ID:",
                jobId
            );

            console.log(
                "==========================================\n"
            );


            // -----------------------------------------
            // Start stage
            // -----------------------------------------

            await ProgressService.startStage(
                jobId,
                STAGES.CLIP_EXTRACTION
            );

            console.log(
                "[ClipExtraction] Stage started."
            );


            // -----------------------------------------
            // Storage paths
            // -----------------------------------------

            const paths =
                Storage.getPaths(jobId);


            console.log(
                "[ClipExtraction] Storage paths loaded."
            );


            // -----------------------------------------
            // Source movie
            //
            // TEMPORARY:
            // We are hardcoding the movie filename
            // until JobService/database persistence
            // is implemented.
            // -----------------------------------------

            const moviePath =
                Storage.getInputMovie(
                    "The Isolate Thief.mp4"
                );


            console.log(
                "[ClipExtraction] Source movie:",
                moviePath
            );


            // -----------------------------------------
            // Verify source movie
            // -----------------------------------------

            if (
                !fs.existsSync(moviePath)
            ) {

                throw new Error(
                    `Source movie not found: ${moviePath}`
                );

            }


            // -----------------------------------------
            // Clip plan
            // -----------------------------------------

            const clipPlanPath =
                path.join(
                    paths.metadata,
                    "clip_plan.json"
                );


            console.log(
                "[ClipExtraction] Reading clip plan..."
            );

            console.log(
                "[ClipExtraction] Clip plan:",
                clipPlanPath
            );


            if (
                !fs.existsSync(clipPlanPath)
            ) {

                throw new Error(
                    `clip_plan.json not found: ${clipPlanPath}`
                );

            }


            const clipPlanRaw =
                await fs.promises.readFile(
                    clipPlanPath,
                    "utf-8"
                );


            const clipPlan =
                JSON.parse(clipPlanRaw);


            if (
                !Array.isArray(clipPlan.clips) ||
                clipPlan.clips.length === 0
            ) {

                throw new Error(
                    "No clips found in clip_plan.json"
                );

            }


            console.log(
                `[ClipExtraction] Total clips: ${clipPlan.clips.length}`
            );


            // -----------------------------------------
            // Output directory
            // -----------------------------------------

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


            console.log(
                "[ClipExtraction] Output directory:",
                outputDirectory
            );


            // -----------------------------------------
            // Extract clips
            // -----------------------------------------

            let completedCount = 0;


            for (
                const clip of clipPlan.clips
            ) {

                console.log(
                    "\n------------------------------------------"
                );

                console.log(
                    `[ClipExtraction] Processing ${clip.id}`
                );

                console.log(
                    `Start: ${clip.start}s`
                );

                console.log(
                    `End: ${clip.end}s`
                );


                // -----------------------------------------
                // Validate clip
                // -----------------------------------------

                if (
                    !clip.id
                ) {

                    throw new Error(
                        "Clip is missing an id."
                    );

                }


                if (
                    typeof clip.start !== "number" ||
                    typeof clip.end !== "number"
                ) {

                    throw new Error(
                        `Invalid timestamps for ${clip.id}: ${clip.start} -> ${clip.end}`
                    );

                }


                if (
                    clip.end <= clip.start
                ) {

                    throw new Error(
                        `Invalid duration for ${clip.id}: ${clip.start} -> ${clip.end}`
                    );

                }


                const outputPath =
                    path.join(
                        outputDirectory,
                        `${clip.id}.mp4`
                    );


                // -----------------------------------------
                // Progress check
                // -----------------------------------------

                const completed =
                    await ProgressService.isClipCompleted(
                        jobId,
                        STAGES.CLIP_EXTRACTION,
                        clip.id
                    );


                if (completed) {

                    console.log(
                        `[ClipExtraction] Progress already completed: ${clip.id}`
                    );

                    completedCount++;

                    continue;

                }


                // -----------------------------------------
                // File-level resume protection
                // -----------------------------------------

                if (
                    fs.existsSync(outputPath)
                ) {

                    const stats =
                        await fs.promises.stat(
                            outputPath
                        );


                    if (
                        stats.size > 0
                    ) {

                        console.log(
                            `[ClipExtraction] Output already exists: ${clip.id}`
                        );


                        await ProgressService.completeClip(
                            jobId,
                            STAGES.CLIP_EXTRACTION,
                            clip.id
                        );


                        completedCount++;

                        continue;

                    }

                }


                // -----------------------------------------
                // Extract
                // -----------------------------------------

                console.log(
                    `[ClipExtraction] Sending ${clip.id} to FFmpeg...`
                );


                await ClipExtractionService.extract({

                    inputPath:
                        moviePath,

                    outputPath,

                    start:
                        clip.start,

                    end:
                        clip.end

                });


                // -----------------------------------------
                // Mark clip completed
                // -----------------------------------------

                await ProgressService.completeClip(
                    jobId,
                    STAGES.CLIP_EXTRACTION,
                    clip.id
                );


                completedCount++;


                console.log(
                    `[ClipExtraction] ${clip.id} completed successfully.`
                );

                console.log(
                    `[ClipExtraction] Progress: ${completedCount}/${clipPlan.clips.length}`
                );

            }


            // -----------------------------------------
            // Final verification
            // -----------------------------------------

            console.log(
                "\n[ClipExtraction] Verifying extracted clips..."
            );


            for (
                const clip of clipPlan.clips
            ) {

                const outputPath =
                    path.join(
                        outputDirectory,
                        `${clip.id}.mp4`
                    );


                if (
                    !fs.existsSync(outputPath)
                ) {

                    throw new Error(
                        `Clip extraction incomplete. Missing: ${clip.id}`
                    );

                }


                const stats =
                    await fs.promises.stat(
                        outputPath
                    );


                if (
                    stats.size === 0
                ) {

                    throw new Error(
                        `Clip extraction incomplete. Empty file: ${clip.id}`
                    );

                }

            }


            // -----------------------------------------
            // Complete stage
            // -----------------------------------------

            await ProgressService.completeStage(
                jobId,
                STAGES.CLIP_EXTRACTION
            );


            console.log(
                "\n=========================================="
            );

            console.log(
                "Clip Extraction Completed"
            );

            console.log(
                `Extracted: ${completedCount}/${clipPlan.clips.length}`
            );

            console.log(
                "==========================================\n"
            );


            // -----------------------------------------
            // Publish next event
            // -----------------------------------------

            EventBus.publish(
                events.CLIP_EXTRACTION_COMPLETED,
                {
                    jobId
                }
            );


        } catch (error) {

            console.error(
                "\n=========================================="
            );

            console.error(
                "CLIP EXTRACTION WORKER FAILED"
            );

            console.error(
                "Job ID:",
                jobId
            );

            console.error(
                error
            );

            console.error(
                "==========================================\n"
            );


            // -----------------------------------------
            // Fail stage
            // -----------------------------------------

            await ProgressService.failStage(
                jobId,
                STAGES.CLIP_EXTRACTION,
                error.message
            );


            // -----------------------------------------
            // Publish failure event
            // -----------------------------------------

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