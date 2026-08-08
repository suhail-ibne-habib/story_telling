const EventBus = require("../core/EventBus");
const events = require("../events/events");
const Storage = require("../../storage/StorageService");

const path = require("path");
const fs = require("fs");

const ChunkAnalysisService = require("../services/ChunkAnalysisService");
const ProgressService = require('../services/ProgressService')
const STAGES = require('../constance/pipelineStages')

EventBus.subscribe(
    events.VISION_ANALYZE_COMPLETED,
    async ({ jobId }) => {
        try {
            console.log("Chunk Analysis Worker is running....");

            await ProgressService.startStage(jobId, STAGES.CHUNK_ANALYSIS)

            const paths = Storage.getPaths(jobId);

            const moviePath = path.join(
                paths.metadata,
                "movie_enrichment.json"
            );

            const [
                movieRaw,
                chunkFiles
            ] = await Promise.all([
                fs.promises.readFile(
                    moviePath,
                    "utf8"
                ),

                fs.promises.readdir(
                    paths.chunks
                )
            ]);

            const movie = JSON.parse(movieRaw);

            for (const file of chunkFiles) {

                if (!file.endsWith(".json")) {
                    continue;
                }

                const chunkPath = path.join(
                    paths.chunks,
                    file
                );

                const outputPath = path.join(
                    paths.chunkAnalysis,
                    file
                );

                // Skip already processed chunks
                // if (fs.existsSync(outputPath)) {
                //     console.log(`Skipping ${file}`);
                //     continue;
                // }

                const chunkRaw = await fs.promises.readFile(
                    chunkPath,
                    "utf-8"
                );

                const chunk = JSON.parse(chunkRaw);

                const completed = await ProgressService.isChunkCompleted(
                    jobId,
                    STAGES.CHUNK_ANALYSIS,
                    chunk.id
                )

                if (completed) {
                    console.log(`Skipping chunk ${chunk.id} - already completed`)
                    continue
                }

                const visualDirectory = path.join(
                    paths.visualAnalysis,
                    chunk.id.toLowerCase()
                );

                let visualAnalysisFiles = await fs.promises.readdir(visualDirectory)

                const sections = []

                visualAnalysisFiles = visualAnalysisFiles.sort()

                for (const file of visualAnalysisFiles) {
                    if (!file.endsWith(".txt")) {
                        continue;
                    }

                    const text = await fs.promises.readFile(
                        path.join(
                            visualDirectory,
                            file
                        ),
                        "utf-8"
                    )
                    sections.push(text)
                }

                const visualAnalysis =
                    sections.join(
                        "\n\n-----------------\n\n"
                    );

                console.log({
                    sheets: sections.length,
                    visualLength: visualAnalysis.length
                });


                const analysis =
                    await ChunkAnalysisService.analyze({
                        chunk,
                        movie,
                        visualAnalysis
                    });

                // console.log("[ChunkAnalysis: analysis]: ", analysis);

                let parsed;

                try {

                    parsed = JSON.parse(analysis);

                }
                catch {

                    console.log("========== INVALID JSON ==========");
                    console.log(analysis);
                    console.log("==================================");

                    throw new Error(
                        "DeepSeek returned invalid JSON."
                    );

                }

                await fs.promises.writeFile(
                    outputPath,
                    JSON.stringify(
                        parsed,
                        null,
                        2
                    )
                );

                await ProgressService.completeChunk(jobId, STAGES.CHUNK_ANALYSIS, chunk.id)
            }

            console.log("Chunk Analysis Completed");

            await ProgressService.completeStage(jobId, STAGES.CHUNK_ANALYSIS)

            EventBus.publish(
                events.CHUNK_ANALYSIS_COMPLETED,
                {
                    jobId
                }
            );

        } catch (error) {

            console.error(
                "Chunk Analysis Worker Failed",
                error
            );

            await ProgressService.failStage(jobId, STAGES.CHUNK_ANALYSIS, error.message)

            EventBus.publish(
                events.CHUNK_ANALYSIS_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );
        }
    }
);