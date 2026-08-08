const EventBus = require("../core/EventBus");
const events = require("../events/events");

const ProgressService = require("../services/ProgressService");

const Storage = require("../../storage/StorageService");
const path = require("path");
const fs = require("fs");

const ClipPlanningService = require("../services/ClipPlanningService");

const STAGES = require("../constance/pipelineStages");


EventBus.subscribe(
    events.FULL_MOVIE_UNDERSTANDING_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log("\n========================================");
            console.log("CLIP PLANNING WORKER STARTED");
            console.log("Job ID:", jobId);
            console.log("========================================\n");


            /*
            |--------------------------------------------------------------------------
            | Start Stage
            |--------------------------------------------------------------------------
            */

            console.log("[ClipPlanning] Starting stage...");

            await ProgressService.startStage(
                jobId,
                STAGES.CLIP_PLANNING
            );

            console.log("[ClipPlanning] Stage started successfully");


            /*
            |--------------------------------------------------------------------------
            | Storage Paths
            |--------------------------------------------------------------------------
            */

            const paths =
                Storage.getPaths(jobId);

            console.log("[ClipPlanning] Storage paths loaded");


            /*
            |--------------------------------------------------------------------------
            | Movie Metadata
            |--------------------------------------------------------------------------
            */

            const moviePath =
                path.join(
                    paths.metadata,
                    "movie_enrichment.json"
                );

            console.log(
                "[ClipPlanning] Reading movie metadata..."
            );

            const movieRaw =
                await fs.promises.readFile(
                    moviePath,
                    "utf-8"
                );

            const movie =
                JSON.parse(movieRaw);

            console.log(
                "[ClipPlanning] Movie metadata loaded:",
                movie.title
            );


            /*
            |--------------------------------------------------------------------------
            | Full Movie Understanding
            |--------------------------------------------------------------------------
            */

            const movieUnderstandingPath =
                path.join(
                    paths.metadata,
                    "movie_understanding.json"
                );

            console.log(
                "[ClipPlanning] Reading movie understanding..."
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
                "[ClipPlanning] Movie understanding loaded"
            );


            /*
            |--------------------------------------------------------------------------
            | Load Chunk Analyses
            |--------------------------------------------------------------------------
            */

            console.log(
                "[ClipPlanning] Loading chunk analysis files..."
            );

            const analysisFiles =
                await fs.promises.readdir(
                    paths.chunkAnalysis
                );

            console.log(
                `[ClipPlanning] Found ${analysisFiles.length} files`
            );


            const analysisMap =
                new Map();


            for (const file of analysisFiles) {

                if (!file.endsWith(".json")) {
                    continue;
                }


                const analysisPath =
                    path.join(
                        paths.chunkAnalysis,
                        file
                    );


                const raw =
                    await fs.promises.readFile(
                        analysisPath,
                        "utf-8"
                    );


                const analysis =
                    JSON.parse(raw);


                const chunkId =
                    path.basename(
                        file,
                        ".json"
                    );


                analysisMap.set(
                    chunkId.toLowerCase(),
                    analysis
                );

            }


            console.log(
                `[ClipPlanning] Loaded ${analysisMap.size} chunk analyses`
            );


            /*
            |--------------------------------------------------------------------------
            | Load Chunk Context
            |--------------------------------------------------------------------------
            */

            console.log(
                "[ClipPlanning] Building chunk contexts..."
            );


            const chunkFiles =
                await fs.promises.readdir(
                    paths.chunks
                );


            const chunkContexts = [];


            const sortedChunkFiles =
                chunkFiles
                    .filter(
                        file =>
                            file.endsWith(".json")
                    )
                    .sort();


            for (const file of sortedChunkFiles) {

                const chunkPath =
                    path.join(
                        paths.chunks,
                        file
                    );


                const chunkRaw =
                    await fs.promises.readFile(
                        chunkPath,
                        "utf-8"
                    );


                const chunk =
                    JSON.parse(chunkRaw);


                const chunkId =
                    chunk.id;


                const analysis =
                    analysisMap.get(
                        chunkId.toLowerCase()
                    );


                if (!analysis) {

                    console.log(
                        `[ClipPlanning] Missing analysis for ${chunkId}`
                    );

                    continue;
                }


                chunkContexts.push({

                    chunkId,

                    timeline:
                        chunk.timeline,

                    analysis

                });

            }


            console.log(
                `[ClipPlanning] Chunk contexts ready: ${chunkContexts.length}`
            );


            if (!chunkContexts.length) {

                throw new Error(
                    "No chunk contexts were found."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | DeepSeek
            |--------------------------------------------------------------------------
            */

            console.log("\n----------------------------------------");
            console.log("[ClipPlanning] DeepSeek is working...");
            console.log(
                `[ClipPlanning] Sending ${chunkContexts.length} chunks for clip planning`
            );
            console.log("----------------------------------------\n");


            const deepSeekStarted =
                Date.now();


            const result =
                await ClipPlanningService.analyze({
                    movie,
                    movieUnderstanding,
                    chunkContexts
                });


            const deepSeekTime =
                (
                    (Date.now() - deepSeekStarted) /
                    1000
                ).toFixed(2);


            console.log(
                `[ClipPlanning] DeepSeek completed in ${deepSeekTime}s`
            );


            console.log(
                "[ClipPlanning] DeepSeek response received"
            );


            /*
            |--------------------------------------------------------------------------
            | Parse Response
            |--------------------------------------------------------------------------
            */

            console.log(
                "[ClipPlanning] Parsing DeepSeek response..."
            );


            let parsed;


            try {

                parsed =
                    JSON.parse(result);

            } catch {

                console.error(
                    "========== INVALID CLIP PLAN JSON =========="
                );

                console.error(result);

                console.error(
                    "============================================"
                );

                throw new Error(
                    "DeepSeek returned invalid clip plan JSON."
                );

            }


            console.log(
                "[ClipPlanning] Clip plan JSON parsed successfully"
            );


            /*
            |--------------------------------------------------------------------------
            | Save Clip Plan
            |--------------------------------------------------------------------------
            */

            const outputPath =
                path.join(
                    paths.metadata,
                    "clip_plan.json"
                );


            console.log(
                "[ClipPlanning] Saving clip plan..."
            );


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
                "[ClipPlanning] Clip plan saved:",
                outputPath
            );


            /*
            |--------------------------------------------------------------------------
            | Complete Stage
            |--------------------------------------------------------------------------
            */

            await ProgressService.completeStage(
                jobId,
                STAGES.CLIP_PLANNING
            );


            console.log(
                "\n========================================"
            );

            console.log(
                "CLIP PLANNING COMPLETED"
            );

            console.log(
                "========================================\n"
            );


            EventBus.publish(
                events.CLIP_PLANNING_COMPLETED,
                {
                    jobId
                }
            );


        } catch (error) {

            console.error(
                "\n========================================"
            );

            console.error(
                "CLIP PLANNING WORKER FAILED"
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
                STAGES.CLIP_PLANNING,
                error.message
            );


            EventBus.publish(
                events.CLIP_PLANNING_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );

        }

    }

);