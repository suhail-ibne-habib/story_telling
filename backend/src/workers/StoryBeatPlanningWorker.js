const STAGES =
    require("../constance/pipelineStages");

const EventBus =
    require("../core/EventBus");

const events =
    require("../events/events");

const ProgressService =
    require("../services/ProgressService");

const StoryBeatPlanningService =
    require("../services/StoryBeatPlanningService");

const Storage =
    require("../../storage/StorageService");

const path =
    require("path");

const fs =
    require("fs");


EventBus.subscribe(
    events.FULL_MOVIE_UNDERSTANDING_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========================================"
            );

            console.log(
                "Story Beat Planning Worker started!"
            );

            console.log(
                "Job ID:",
                jobId
            );

            console.log(
                "========================================\n"
            );


            /*
             * Start Stage
             */

            await ProgressService.startStage(
                jobId,
                STAGES.STORY_BEAT_PLANNING
            );


            console.log(
                "Story Beat Planning stage started."
            );


            /*
             * Get Storage Paths
             */

            const paths =
                Storage.getPaths(jobId);


            /*
             * Output
             */

            const outputPath =
                path.join(
                    paths.metadata,
                    "story_beats.json"
                );


            /*
             * Resume Protection
             *
             * If story_beats.json already exists,
             * don't call DeepSeek again.
             */

            if (
                fs.existsSync(outputPath)
            ) {

                console.log(
                    "story_beats.json already exists."
                );

                console.log(
                    "Skipping Story Beat Planning."
                );


                await ProgressService.completeStage(
                    jobId,
                    STAGES.STORY_BEAT_PLANNING
                );


                EventBus.publish(
                    events.STORY_BEAT_PLANNING_COMPLETED,
                    {
                        jobId
                    }
                );


                return;
            }


            /*
             * Reading Movie File
             */

            console.log(
                "Loading movie enrichment file..."
            );


            const moviePath =
                path.join(
                    paths.metadata,
                    "movie_enrichment.json"
                );


            const movieRaw =
                await fs.promises.readFile(
                    moviePath,
                    "utf-8"
                );


            const movie =
                JSON.parse(movieRaw);


            console.log(
                "Movie enrichment loaded."
            );


            /*
             * Reading Movie Understanding
             */

            console.log(
                "Loading movie understanding..."
            );


            const movieUnderstandingPath =
                path.join(
                    paths.metadata,
                    "movie_understanding.json"
                );


            const movieUnderstandingRaw =
                await fs.promises.readFile(
                    movieUnderstandingPath,
                    "utf-8"
                );


            const movieUnderstanding =
                JSON.parse(
                    movieUnderstandingRaw
                );


            console.log(
                "Movie understanding loaded."
            );


            /*
             * Reading Chunk Analyses
             *
             * We do NOT read the original chunk
             * files here.
             *
             * Story Beat Planning only needs:
             *
             * - chunkId
             * - chunk analysis
             *
             * Timestamp / shot information will
             * be handled later by Shot Mapping.
             */

            console.log(
                "Loading chunk analyses..."
            );


            const analysisFiles =
                await fs.promises.readdir(
                    paths.chunkAnalysis
                );


            const sortedAnalysisFiles =
                analysisFiles
                    .filter(
                        file =>
                            file.endsWith(".json")
                    )
                    .sort();


            const chunkContexts = [];


            for (
                const file of sortedAnalysisFiles
            ) {

                const analysisPath =
                    path.join(
                        paths.chunkAnalysis,
                        file
                    );


                const analysisRaw =
                    await fs.promises.readFile(
                        analysisPath,
                        "utf-8"
                    );


                const analysis =
                    JSON.parse(
                        analysisRaw
                    );


                const chunkId =
                    path.basename(
                        file,
                        ".json"
                    );


                chunkContexts.push({

                    chunkId,

                    analysis

                });

            }


            /*
             * Make sure we actually have
             * chunk analysis available.
             */

            if (
                !chunkContexts.length
            ) {

                throw new Error(
                    "No chunk analysis files were found."
                );

            }


            console.log(
                "Chunk analyses loaded:",
                chunkContexts.length
            );


            /*
             * DeepSeek Request
             */

            console.log(
                "\n========================================"
            );

            console.log(
                "Sending story beat planning request to DeepSeek..."
            );

            console.log(
                "========================================\n"
            );


            const result =
                await StoryBeatPlanningService.analyze({

                    movie,

                    movieUnderstanding,

                    chunkContexts

                });


            console.log(
                "DeepSeek story beat planning completed."
            );


            /*
             * Parse DeepSeek Response
             */

            let parsed;


            try {

                parsed =
                    JSON.parse(result);

            } catch (error) {

                console.error(
                    "\n========== INVALID STORY BEAT JSON =========="
                );

                console.error(
                    result
                );

                console.error(
                    "==============================================\n"
                );


                throw new Error(
                    "DeepSeek returned invalid story beat JSON."
                );

            }


            /*
             * Validate beats
             */

            if (
                !Array.isArray(
                    parsed.beats
                )
            ) {

                throw new Error(
                    "Story beat response does not contain a beats array."
                );

            }


            /*
             * Maximum 20 beats
             */

            if (
                parsed.beats.length > 20
            ) {

                throw new Error(
                    `DeepSeek returned ${parsed.beats.length} beats. Maximum is 20.`
                );

            }


            /*
             * Validate chunk IDs
             *
             * This makes sure DeepSeek didn't
             * invent a chunk ID.
             */

            const availableChunkIds =
                new Set(
                    chunkContexts.map(
                        context =>
                            context.chunkId.toLowerCase()
                    )
                );


            for (
                const beat of parsed.beats
            ) {

                if (
                    !beat.chunkId
                ) {

                    throw new Error(
                        `Story beat ${beat.id || "unknown"} is missing chunkId.`
                    );

                }


                if (
                    !availableChunkIds.has(
                        beat.chunkId.toLowerCase()
                    )
                ) {

                    throw new Error(
                        `Story beat ${beat.id || "unknown"} references unknown chunk: ${beat.chunkId}`
                    );

                }

            }


            /*
             * Save story_beats.json
             */

            await fs.promises.writeFile(

                outputPath,

                JSON.stringify(
                    parsed,
                    null,
                    2
                ),

                "utf-8"

            );


            console.log(
                "\n========================================"
            );

            console.log(
                "Story beats saved successfully."
            );

            console.log(
                "Output:",
                outputPath
            );

            console.log(
                "Beat count:",
                parsed.beats.length
            );

            console.log(
                "========================================\n"
            );


            /*
             * Complete Stage
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.STORY_BEAT_PLANNING
            );


            console.log(
                "Story Beat Planning Completed."
            );


            /*
             * Trigger Next Stage
             */

            EventBus.publish(
                events.STORY_BEAT_PLANNING_COMPLETED,
                {
                    jobId
                }
            );


        } catch (error) {

            console.error(
                "\n========================================"
            );

            console.error(
                "STORY BEAT PLANNING WORKER FAILED"
            );

            console.error(
                "Job ID:",
                jobId
            );

            console.error(
                error
            );

            console.error(
                "========================================\n"
            );


            await ProgressService.failStage(
                jobId,
                STAGES.STORY_BEAT_PLANNING,
                error.message
            );


            /*
             * Notify pipeline that this stage failed.
             */

            EventBus.publish(
                events.STORY_BEAT_PLANNING_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );

        }

    }
);