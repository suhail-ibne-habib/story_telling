const EventBus = require("../core/EventBus");
const events = require("../events/events");

const StorageService = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");

const ScriptGenerationService = require(
    "../services/ScriptGenerationService"
);

const STAGES = require("../constance/pipelineStages");

const path = require("path");
const fs = require("fs");


EventBus.subscribe(

    events.CLIP_EXTRACTION_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== SCRIPT GENERATION WORKER =========="
            );

            console.log(
                `[ScriptGeneration] Job ID: ${jobId}`
            );


            /*
             * 1. Start stage
             */

            await ProgressService.startStage(
                jobId,
                STAGES.SCRIPT
            );


            /*
             * 2. Get storage paths
             */

            const paths =
                StorageService.getPaths(jobId);


            /*
             * 3. Shot mapping
             *
             * This contains:
             *
             * - beats
             * - selectedShots
             * - chunkIds
             * - cut information
             */

            const shotMappingPath =
                path.join(
                    paths.shotMapping,
                    "shot_mapping.json"
                );


            if (
                !fs.existsSync(
                    shotMappingPath
                )
            ) {

                throw new Error(
                    `shot_mapping.json not found: ${shotMappingPath}`
                );

            }


            /*
             * 4. Read shot mapping
             */

            const shotMappingRaw =
                await fs.promises.readFile(
                    shotMappingPath,
                    "utf-8"
                );


            const shotMappingData =
                JSON.parse(
                    shotMappingRaw
                );


            if (
                !shotMappingData ||
                !Array.isArray(
                    shotMappingData.beats
                )
            ) {

                throw new Error(
                    "shot_mapping.json must contain a beats array."
                );

            }


            const beats =
                shotMappingData.beats;


            console.log(
                `[ScriptGeneration] Loaded ${beats.length} beats`
            );


            /*
             * 5. Load movie enrichment
             */

            const moviePath =
                path.join(
                    paths.metadata,
                    "movie_enrichment.json"
                );


            if (
                !fs.existsSync(
                    moviePath
                )
            ) {

                throw new Error(
                    `movie_enrichment.json not found: ${moviePath}`
                );

            }


            const movieRaw =
                await fs.promises.readFile(
                    moviePath,
                    "utf-8"
                );


            const movie =
                JSON.parse(
                    movieRaw
                );


            /*
             * 6. Prepare script output directory
             */

            const outputDirectory =
                paths.scripts;


            await fs.promises.mkdir(
                outputDirectory,
                {
                    recursive: true
                }
            );


            /*
             * 7. Process every beat
             */

            for (
                const beat of beats
            ) {

                if (
                    !beat.beatId
                ) {

                    console.warn(
                        "[ScriptGeneration] Skipping beat without beatId."
                    );

                    continue;

                }


                console.log(
                    `\n[ScriptGeneration] Processing ${beat.beatId}`
                );


                /*
                 * 8. Resume protection
                 *
                 * ProgressService is the source
                 * of truth.
                 */

                const completed =
                    await ProgressService.isChunkCompleted(
                        jobId,
                        STAGES.SCRIPT,
                        beat.beatId
                    );


                if (
                    completed
                ) {

                    console.log(
                        `[ScriptGeneration] Skipping completed beat ${beat.beatId}`
                    );

                    continue;

                }


                /*
                 * 9. Validate selected shots
                 */

                if (
                    !Array.isArray(
                        beat.selectedShots
                    ) ||
                    beat.selectedShots.length === 0
                ) {

                    console.warn(
                        `[ScriptGeneration] ${beat.beatId} has no selected shots.`
                    );

                    continue;

                }


                /*
                 * 10. Determine beat timeline
                 */

                const startTime =
                    Number(
                        beat.cut?.startTime ??
                        beat.selectedShots[0]?.startTime
                    );


                const endTime =
                    Number(
                        beat.cut?.endTime ??
                        beat.selectedShots[
                            beat.selectedShots.length - 1
                        ]?.endTime
                    );


                if (
                    !Number.isFinite(startTime) ||
                    !Number.isFinite(endTime) ||
                    endTime <= startTime
                ) {

                    throw new Error(
                        `Invalid timeline for ${beat.beatId}: ${startTime} -> ${endTime}`
                    );

                }


                /*
                 * 11. Load visual analysis
                 *
                 * We are NOT filtering by timestamp yet.
                 *
                 * We simply load all Gemini visual
                 * analysis belonging to the chunks
                 * used by this beat.
                 */

                let visualAnalysis = [];


                const chunkIds =
                    Array.isArray(
                        beat.chunkIds
                    )
                        ? beat.chunkIds
                        : [];


                for (
                    const chunkId
                    of chunkIds
                ) {

                    const chunkAnalysisDirectory =
                        path.join(
                            paths.visualAnalysis,
                            String(
                                chunkId
                            ).toLowerCase()
                        );


                    if (
                        !fs.existsSync(
                            chunkAnalysisDirectory
                        )
                    ) {

                        console.warn(
                            `[ScriptGeneration] Visual analysis directory not found: ${chunkAnalysisDirectory}`
                        );

                        continue;

                    }


                    const analysisFiles =
                        await fs.promises.readdir(
                            chunkAnalysisDirectory
                        );


                    for (
                        const analysisFileName
                        of analysisFiles
                    ) {

                        if (
                            !analysisFileName.endsWith(
                                ".json"
                            )
                        ) {

                            continue;

                        }


                        const analysisFilePath =
                            path.join(
                                chunkAnalysisDirectory,
                                analysisFileName
                            );


                        const analysisRaw =
                            await fs.promises.readFile(
                                analysisFilePath,
                                "utf-8"
                            );


                        let analysisData;


                        try {

                            analysisData =
                                JSON.parse(
                                    analysisRaw
                                );

                        } catch (error) {

                            console.warn(
                                `[ScriptGeneration] Invalid visual analysis JSON: ${analysisFilePath}`
                            );

                            continue;

                        }


                        /*
                         * Gemini returns an array:
                         *
                         * [
                         *   {
                         *      timestamp: "...",
                         *      description: "..."
                         *   }
                         * ]
                         */

                        if (
                            Array.isArray(
                                analysisData
                            )
                        ) {

                            visualAnalysis.push(
                                ...analysisData
                            );

                        } else {

                            /*
                             * Support a single object too.
                             */

                            visualAnalysis.push(
                                analysisData
                            );

                        }

                    }

                }


                console.log(
                    `[ScriptGeneration] Loaded ${visualAnalysis.length} visual observations for ${beat.beatId}`
                );


                /*
                 * 12. Normalize beat
                 */

                const normalizedBeat = {

                    ...beat,

                    cut: {

                        startTime,

                        endTime,

                        duration:
                            Number(
                                (
                                    endTime -
                                    startTime
                                ).toFixed(3)
                            )

                    }

                };


                /*
                 * 13. Generate narration
                 */

                console.log(
                    `[ScriptGeneration] Sending ${beat.beatId} to DeepSeek...`
                );


                const script =
                    await ScriptGenerationService.generate({

                        movie,

                        beat:
                            normalizedBeat,

                        visualAnalysis

                    });


                /*
                 * 14. Save generated script
                 */

                const outputPath =
                    path.join(
                        outputDirectory,
                        `${beat.beatId.toLowerCase()}.json`
                    );


                await fs.promises.writeFile(

                    outputPath,

                    JSON.stringify(
                        script,
                        null,
                        2
                    ),

                    "utf-8"

                );


                console.log(
                    `[ScriptGeneration] Saved: ${outputPath}`
                );


                /*
                 * 15. Mark beat completed
                 */

                await ProgressService.completeChunk(

                    jobId,

                    STAGES.SCRIPT,

                    beat.beatId

                );


                console.log(
                    `[ScriptGeneration] ${beat.beatId} completed.`
                );

            }


            /*
             * 16. Complete stage
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.SCRIPT
            );


            console.log(
                "\n[ScriptGeneration] Script generation completed."
            );


            /*
             * 17. Trigger next stage
             */

            EventBus.publish(

                events.SCRIPT_GENERATION_COMPLETED,

                {
                    jobId
                }

            );


            console.log(
                "============================================\n"
            );


        } catch (error) {

            console.error(
                "[ScriptGeneration] Worker failed:",
                error
            );


            /*
             * Mark stage failed
             */

            try {

                await ProgressService.failStage(

                    jobId,

                    STAGES.SCRIPT,

                    error.message

                );

            } catch (
            progressError
            ) {

                console.error(
                    "[ScriptGeneration] Failed to update progress:",
                    progressError
                );

            }


            /*
             * Notify pipeline
             */

            EventBus.publish(

                events.SCRIPT_GENERATION_FAILED,

                {
                    jobId,

                    error:
                        error.message

                }

            );

        }

    }

);