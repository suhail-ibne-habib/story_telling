const EventBus = require("../core/EventBus");
const events = require("../events/events");

const Storage = require("../../storage/StorageService");

const path = require("path");
const fs = require("fs");

const ContactSheetService = require(
    "../services/ContactSheetService"
);
const DuplicateFrameService = require("../services/DuplicateFrameService");

EventBus.subscribe(
    events.CHUNKS_COMPLETED,
    async ({ jobId }) => {
        try {

            console.log("Contact Sheet Worker is running...")

            const paths = Storage.getPaths(jobId)

            const chunkFiles = await fs.promises.readdir(
                paths.chunks
            )

            for (const file of chunkFiles) {
                if (!file.endsWith('.json')) {
                    continue
                }

                const chunkPath = path.join(
                    paths.chunks,
                    file
                )

                const chunkRaw = await fs.promises.readFile(
                    chunkPath,
                    "utf8"
                )

                const chunk = JSON.parse(chunkRaw)

                const framePaths = []

                for (const shot of chunk.shots) {
                    for (const frame of shot.frames) {
                        framePaths.push(
                            frame.path
                        )
                    }
                }

                const outputDirectory = path.join(
                    paths.contactSheets,
                    chunk.id.toLowerCase()
                )

                await fs.promises.mkdir(
                    outputDirectory,
                    {
                        recursive: true
                    }
                )

                const result = await DuplicateFrameService.filter(
                    framePaths
                )

                console.log(
                    `[DuplicateFrameService] ${result.originalCount} -> ${result.uniqueCount} frames`
                )

                const contactSheets = await ContactSheetService.generate(
                    result.uniqueFrames,
                    outputDirectory
                )

                chunk.contactSheets = contactSheets

                await fs.promises.writeFile(
                    chunkPath,
                    JSON.stringify(
                        chunk,
                        null,
                        2
                    )
                )

                console.log(
                    `Generated contact sheet for ${chunk.id}`
                )
            }

            EventBus.publish(
                events.CONTACT_SHEETS_COMPLETED,
                {
                    jobId
                }
            )

        } catch (error) {
            console.error(
                "Contact Sheet Worker Failed",
                error
            )

            EventBus.publish(
                events.CONTACT_SHEETS_FAILED,
                {
                    jobId,
                    error: error.message
                }
            )
        }
    }
)