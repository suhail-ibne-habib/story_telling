const EventBus = require("../core/EventBus");
const events = require("../events/events");

const StorageService = require("../../storage/StorageService");

const ChunkBuilderService = require(
    "../services/ChunkBuilderService"
);

const ProgressService = require(
    "../services/ProgressService"
);

const STAGES = require(
    "../constance/pipelineStages"
);

const path = require("path");
const fs = require("fs");


EventBus.subscribe(

    events.FRAMES_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== CHUNK BUILDER WORKER =========="
            );

            console.log(
                `[ChunkBuilder] Job ID: ${jobId}`
            );


            /*
             * 1. Start stage
             */

            await ProgressService.startStage(
                jobId,
                STAGES.CHUNKS
            );


            /*
             * 2. Get storage paths
             */

            const paths =
                StorageService.getPaths(jobId);


            /*
             * 3. Required input files
             *
             * These are produced by previous stages.
             */

            const framesPath =
                path.join(
                    paths.frames,
                    "frames.json"
                );

            const transcriptPath =
                path.join(
                    paths.transcript,
                    "transcript.json"
                );

            const metadataPath =
                path.join(
                    paths.metadata,
                    "meta_data.json"
                );


            /*
             * 4. Validate required inputs
             */

            if (
                !fs.existsSync(framesPath)
            ) {

                throw new Error(
                    `frames.json not found: ${framesPath}`
                );

            }


            if (
                !fs.existsSync(transcriptPath)
            ) {

                throw new Error(
                    `transcript.json not found: ${transcriptPath}`
                );

            }


            if (
                !fs.existsSync(metadataPath)
            ) {

                throw new Error(
                    `meta_data.json not found: ${metadataPath}`
                );

            }


            /*
             * 5. Read required files
             */

            const [
                framesRaw,
                transcriptRaw,
                metadataRaw
            ] = await Promise.all([

                fs.promises.readFile(
                    framesPath,
                    "utf-8"
                ),

                fs.promises.readFile(
                    transcriptPath,
                    "utf-8"
                ),

                fs.promises.readFile(
                    metadataPath,
                    "utf-8"
                )

            ]);


            /*
             * 6. Parse input data
             */

            const shots =
                JSON.parse(framesRaw);

            const transcriptJson =
                JSON.parse(transcriptRaw);

            const metadata =
                JSON.parse(metadataRaw);


            /*
             * 7. Validate input structures
             */

            if (
                !Array.isArray(shots) ||
                shots.length === 0
            ) {

                throw new Error(
                    "frames.json does not contain any shots."
                );

            }


            if (
                !transcriptJson ||
                !Array.isArray(
                    transcriptJson.transcription
                )
            ) {

                throw new Error(
                    "transcript.json contains invalid transcription data."
                );

            }


            if (
                !metadata ||
                typeof metadata.duration !== "number"
            ) {

                throw new Error(
                    "meta_data.json does not contain a valid movie duration."
                );

            }


            const transcript =
                transcriptJson.transcription;


            console.log(
                `[ChunkBuilder] Loaded ${shots.length} shots`
            );

            console.log(
                `[ChunkBuilder] Loaded ${transcript.length} transcript segments`
            );

            console.log(
                `[ChunkBuilder] Movie duration: ${metadata.duration}s`
            );


            /*
             * 8. Build chunks
             */

            console.log(
                "[ChunkBuilder] Building chunks..."
            );


            const chunks =
                ChunkBuilderService.build(
                    shots,
                    transcript,
                    metadata.duration
                );


            /*
             * 9. Validate result
             */

            if (
                !Array.isArray(chunks)
            ) {

                throw new Error(
                    "ChunkBuilderService returned invalid data."
                );

            }


            if (
                chunks.length === 0
            ) {

                throw new Error(
                    "ChunkBuilderService returned zero chunks."
                );

            }


            console.log(
                `[ChunkBuilder] Built ${chunks.length} chunks`
            );


            /*
             * 10. Make sure chunks directory exists
             */

            await fs.promises.mkdir(
                paths.chunks,
                {
                    recursive: true
                }
            );


            /*
             * 11. Save individual chunks
             */

            for (
                const chunk of chunks
            ) {

                if (
                    !chunk.id
                ) {

                    throw new Error(
                        "Chunk is missing an ID."
                    );

                }


                const filename =
                    `${chunk.id.toLowerCase()}.json`;


                const chunkFile =
                    path.join(
                        paths.chunks,
                        filename
                    );


                await fs.promises.writeFile(

                    chunkFile,

                    JSON.stringify(
                        chunk,
                        null,
                        2
                    ),

                    "utf-8"

                );

            }


            console.log(
                `[ChunkBuilder] Saved ${chunks.length} chunk files`
            );


            /*
             * 12. Complete stage
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.CHUNKS
            );


            console.log(
                "[ChunkBuilder] Chunk building stage completed."
            );


            /*
             * 13. Trigger next stage
             */

            EventBus.publish(

                events.CHUNKS_COMPLETED,

                {
                    jobId
                }

            );


            console.log(
                "========================================\n"
            );


        } catch (error) {

            console.error(
                "[ChunkBuilder] Worker failed:",
                error
            );


            /*
             * 14. Mark stage failed
             */

            try {

                await ProgressService.failStage(

                    jobId,

                    STAGES.CHUNKS,

                    error.message

                );

            } catch (progressError) {

                console.error(
                    "[ChunkBuilder] Failed to update progress:",
                    progressError
                );

            }


            /*
             * 15. Notify pipeline
             */

            EventBus.publish(

                events.CHUNKS_FAILED,

                {
                    jobId,
                    error: error.message
                }

            );

        }

    }

);