const EventBus =
    require("../core/EventBus");

const events =
    require("../events/events");

const Storage =
    require("../../storage/StorageService");

const ProgressService =
    require("../services/ProgressService");

const MovieUnderstandingService =
    require("../services/MovieUnderstandingService");

const STAGES =
    require("../constance/pipelineStages");

const path =
    require("path");

const fs =
    require("fs");


EventBus.subscribe(
    events.CHUNK_ANALYSIS_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "Full Movie Understanding Worker is running..."
            );


            await ProgressService.startStage(
                jobId,
                STAGES.FULL_MOVIE_UNDERSTANDING
            );


            const paths =
                Storage.getPaths(jobId);


            const moviePath =
                path.join(
                    paths.metadata,
                    "movie_enrichment.json"
                );


            const outputPath =
                path.join(
                    paths.metadata,
                    "movie_understanding.json"
                );


            /*
             * If the final output already exists,
             * the stage has already been completed.
             */

            // if (fs.existsSync(outputPath)) {

            //     console.log(
            //         "Movie understanding already exists. Skipping."
            //     );

            //     await ProgressService.completeStage(
            //         jobId,
            //         STAGES.FULL_MOVIE_UNDERSTANDING
            //     );

            //     EventBus.publish(
            //         events.FULL_MOVIE_UNDERSTANDING_COMPLETED,
            //         { jobId }
            //     );

            //     return;
            // }


            const movieRaw =
                await fs.promises.readFile(
                    moviePath,
                    "utf-8"
                );


            const movie =
                JSON.parse(movieRaw);


            const chunkFiles =
                await fs.promises.readdir(
                    paths.chunkAnalysis
                );


            const chunkAnalyses = [];


            /*
             * Always load chunk analyses
             * in chronological/file order.
             */

            const sortedFiles =
                chunkFiles
                    .filter(
                        file =>
                            file.endsWith(".json")
                    )
                    .sort();


            for (const file of sortedFiles) {

                const chunkPath =
                    path.join(
                        paths.chunkAnalysis,
                        file
                    );


                const raw =
                    await fs.promises.readFile(
                        chunkPath,
                        "utf-8"
                    );


                const analysis =
                    JSON.parse(raw);


                chunkAnalyses.push({
                    chunkId:
                        path.basename(
                            file,
                            ".json"
                        ),

                    analysis
                });

            }


            if (!chunkAnalyses.length) {

                throw new Error(
                    "No chunk analysis files were found."
                );

            }


            console.log({
                chunkCount:
                    chunkAnalyses.length
            });


            const result =
                await MovieUnderstandingService.analyze({
                    movie,
                    chunkAnalyses
                });


            let parsed;


            try {

                parsed =
                    JSON.parse(result);

            } catch {

                console.error(
                    "========== INVALID MOVIE UNDERSTANDING JSON =========="
                );

                console.error(result);

                console.error(
                    "====================================================="
                );

                throw new Error(
                    "DeepSeek returned invalid movie understanding JSON."
                );

            }


            await fs.promises.writeFile(
                outputPath,

                JSON.stringify(
                    parsed,
                    null,
                    2
                ),

                "utf-8"
            );


            await ProgressService.completeStage(
                jobId,
                STAGES.FULL_MOVIE_UNDERSTANDING
            );


            console.log(
                "Full Movie Understanding Completed"
            );


            EventBus.publish(
                events.FULL_MOVIE_UNDERSTANDING_COMPLETED,
                { jobId }
            );


        } catch (error) {

            console.error(
                "Full Movie Understanding Worker Failed",
                error
            );


            await ProgressService.failStage(
                jobId,
                STAGES.FULL_MOVIE_UNDERSTANDING,
                error.message
            );


            EventBus.publish(
                events.FULL_MOVIE_UNDERSTANDING_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );

        }

    }
);