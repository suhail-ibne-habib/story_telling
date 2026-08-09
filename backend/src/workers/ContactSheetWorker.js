const EventBus = require("../core/EventBus");
const events = require("../events/events");

const Storage = require("../../storage/StorageService");

const ProgressService = require("../services/ProgressService");
const ContactSheetService = require("../services/ContactSheetService");
const DuplicateFrameService = require("../services/DuplicateFrameService");

const STAGES = require("../constance/pipelineStages");

const path = require("path");
const fs = require("fs");

EventBus.subscribe(
    events.CHUNKS_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== CONTACT SHEET WORKER =========="
            );

            console.log(
                `[ContactSheet] Job ID: ${jobId}`
            );


            /*
             * 1. Start stage
             */

            await ProgressService.startStage(
                jobId,
                STAGES.CONTACT_SHEETS
            );


            /*
             * 2. Get storage paths
             */

            const paths =
                Storage.getPaths(jobId);


            /*
             * 3. Read chunk files
             */

            const chunkFiles =
                await fs.promises.readdir(
                    paths.chunks
                );


            const jsonChunkFiles =
                chunkFiles.filter(
                    file =>
                        file.endsWith(".json")
                );


            if (
                jsonChunkFiles.length === 0
            ) {

                throw new Error(
                    "No chunk JSON files found."
                );

            }


            console.log(
                `[ContactSheet] Found ${jsonChunkFiles.length} chunk files`
            );


            /*
             * 4. Process each chunk
             */

            for (
                const file of jsonChunkFiles
            ) {

                const chunkPath =
                    path.join(
                        paths.chunks,
                        file
                    );


                /*
                 * Read chunk
                 */

                const chunkRaw =
                    await fs.promises.readFile(
                        chunkPath,
                        "utf8"
                    );


                const chunk =
                    JSON.parse(chunkRaw);


                if (
                    !Array.isArray(chunk.shots)
                ) {

                    throw new Error(
                        `Invalid shots data in chunk: ${file}`
                    );

                }


                console.log(
                    `[ContactSheet] Processing ${chunk.id}`
                );


                /*
                 * 5. Build frame data
                 *
                 * IMPORTANT:
                 * Keep timestamp attached to every frame.
                 *
                 * This is what allows the Python
                 * contact sheet generator to burn
                 * the exact timestamp onto each image.
                 */

                const frameData = [];


                for (
                    const shot of chunk.shots
                ) {

                    if (
                        !Array.isArray(shot.frames)
                    ) {
                        continue;
                    }


                    for (
                        const frame of shot.frames
                    ) {

                        if (
                            !frame.path
                        ) {
                            continue;
                        }


                        frameData.push({

                            path:
                                frame.path,

                            timestamp:
                                frame.timestamp

                        });

                    }

                }


                if (
                    frameData.length === 0
                ) {

                    console.warn(
                        `[ContactSheet] No frames found for ${chunk.id}. Skipping.`
                    );

                    continue;

                }


                console.log(
                    `[ContactSheet] ${chunk.id}: ${frameData.length} frames before duplicate filtering`
                );


                /*
                 * 6. Contact sheet output directory
                 */

                const outputDirectory =
                    path.join(
                        paths.contactSheets,
                        chunk.id.toLowerCase()
                    );


                await fs.promises.mkdir(
                    outputDirectory,
                    {
                        recursive: true
                    }
                );


                /*
                 * 7. Remove duplicate frames
                 *
                 * DuplicateFrameService must return
                 * the original frame objects:
                 *
                 * {
                 *     path,
                 *     timestamp
                 * }
                 *
                 * so the timestamp is never lost.
                 */

                const result =
                    await DuplicateFrameService.filter(
                        frameData
                    );


                console.log(
                    `[DuplicateFrameService] ${result.originalCount} -> ${result.uniqueCount} frames`
                );


                /*
                 * 8. Generate timestamp-burned
                 *    contact sheets
                 */

                const contactSheets =
                    await ContactSheetService.generate(
                        result.uniqueFrames,
                        outputDirectory
                    );


                /*
                 * 9. Attach contact sheets
                 *    to the chunk
                 */

                chunk.contactSheets =
                    contactSheets;


                /*
                 * 10. Save updated chunk
                 */

                await fs.promises.writeFile(

                    chunkPath,

                    JSON.stringify(
                        chunk,
                        null,
                        2
                    ),

                    "utf8"

                );


                console.log(
                    `[ContactSheet] Generated ${contactSheets.length} contact sheets for ${chunk.id}`
                );

            }


            /*
             * 11. Complete stage
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.CONTACT_SHEETS
            );


            console.log(
                "[ContactSheet] Contact sheet stage completed."
            );


            /*
             * 12. Trigger next stage
             */

            EventBus.publish(

                events.CONTACT_SHEETS_COMPLETED,

                {
                    jobId
                }

            );


            console.log(
                "============================================\n"
            );


        } catch (error) {

            console.error(
                "[ContactSheet] Worker failed:",
                error
            );


            /*
             * 13. Mark stage failed
             */

            try {

                await ProgressService.failStage(
                    jobId,
                    STAGES.CONTACT_SHEETS,
                    error.message
                );

            } catch (progressError) {

                console.error(
                    "[ContactSheet] Failed to update progress:",
                    progressError
                );

            }


            /*
             * 14. Notify pipeline
             */

            EventBus.publish(

                events.CONTACT_SHEETS_FAILED,

                {
                    jobId,
                    error: error.message
                }

            );

        }

    }
);