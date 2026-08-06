const EventBus = require("../core/EventBus");
const events = require("../events/events");
const Storage = require("../../storage/StorageService");

const path = require("path");
const fs = require("fs");

const ChunkAnalysisService = require("../services/ChunkAnalysisService");

EventBus.subscribe(
    events.CONTACT_SHEETS_COMPLETED,
    async ({ jobId }) => {
        try {
            console.log("Chunk Analysis Worker is running....");

            const paths = Storage.getPaths(jobId);

            const moviePath = path.join(
                paths.metadata,
                "movie_enrichment.json"
            );

            const charactersPath = path.join(
                paths.characters,
                "characters.json"
            );

            const [
                movieRaw,
                charactersRaw,
                chunkFiles
            ] = await Promise.all([
                fs.promises.readFile(
                    moviePath,
                    "utf8"
                ),

                fs.promises.readFile(
                    charactersPath,
                    "utf8"
                ),

                fs.promises.readdir(
                    paths.chunks
                )
            ]);

            const movie = JSON.parse(movieRaw);
            const characters = JSON.parse(charactersRaw);

            // for (const file of chunkFiles)

            for (let i = 0; i < 1; i++) {
                const file = chunkFiles[i]
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
                if (fs.existsSync(outputPath)) {
                    console.log(`Skipping ${file}`);
                    continue;
                }

                const chunkRaw = await fs.promises.readFile(
                    chunkPath,
                    "utf8"
                );

                const chunk = JSON.parse(chunkRaw);

                const analysis =
                    await ChunkAnalysisService.analyze({
                        chunk,
                        movie,
                        characters
                    });

                await fs.promises.writeFile(
                    outputPath,
                    JSON.stringify(
                        analysis,
                        null,
                        2
                    )
                );
            }

            console.log("Chunk Analysis Completed");

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