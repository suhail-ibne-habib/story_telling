const EventBus = require("../core/EventBus")
const events = require("../events/events")

const Storage = require("../../storage/StorageService")

const path = require('path')
const fs = require('fs')

const VisionAnalysisService = require(
    '../services/VisionAnalysisService'
)
const ProgressService = require("../services/ProgressService")
const STAGES = require("../constance/pipelineStages")

EventBus.subscribe(
    events.CONTACT_SHEETS_COMPLETED,
    async ({ jobId }) => {
        try {
            console.log("Vision Analysis Worker is running...")
            await ProgressService.startStage(jobId, STAGES.VISION_ANALYSIS)

            const paths = Storage.getPaths(jobId);

            const moviePath = path.join(
                paths.metadata,
                "movie_enrichment.json"
            )

            const [movieRaw, chunkFiles] = await Promise.all([
                fs.promises.readFile(moviePath, "utf-8"),
                fs.promises.readdir(paths.chunks)
            ])

            const movie = JSON.parse(movieRaw)

            for (const file of chunkFiles) {
                if (!file.endsWith(".json")) {
                    continue;
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

                if (
                    !chunk.contactSheets || !chunk.contactSheets.length
                ) {
                    console.log(
                        `${chunk.id} has no contact sheets`
                    )

                    continue;
                }

                const outputDirectory = path.join(
                    paths.visualAnalysis,
                    chunk.id.toLowerCase()
                )

                await fs.promises.mkdir(
                    outputDirectory,
                    {
                        recursive: true
                    }
                )

                for (const contactSheet of chunk.contactSheets) {

                    const completed = await ProgressService.isContactSheetCompleted(
                        jobId,
                        STAGES.VISION_ANALYSIS,
                        chunk.id,
                        contactSheet.id
                    )

                    if (completed) {
                        console.log(`Skipping ${chunk.id} / ${contactSheet.id}`)
                        continue
                    }

                    const outputPath = path.join(
                        outputDirectory,
                        `${contactSheet.id.toLowerCase()}.txt`
                    )

                    // if (
                    //     fs.existsSync(
                    //         outputPath
                    //     )
                    // ) {
                    //     console.log(
                    //         `Skipping ${contactSheet.id}`
                    //     )

                    //     continue
                    // }

                    const analysis = await VisionAnalysisService.analyze({
                        chunk,
                        contactSheet
                    })

                    await fs.promises.writeFile(
                        outputPath, analysis
                    )

                    await ProgressService.completeContactSheet(
                        jobId,
                        STAGES.VISION_ANALYSIS,
                        chunk.id,
                        contactSheet.id
                    )

                    console.log(
                        `Analyzed ${contactSheet.id}`
                    )
                }

                const allCompleted = await ProgressService.areAllContactSheetsCompleted(
                    jobId,
                    STAGES.VISION_ANALYSIS,
                    chunk.id,
                    chunk.contactSheets.map(
                        sheet => sheet.id
                    )
                )

                if (allCompleted) {
                    await ProgressService.completeChunk(
                        jobId,
                        STAGES.VISION_ANALYSIS,
                        chunk.id
                    )
                }

            }

            console.log("Vision Analysis Completed")


            await ProgressService.completeStage(
                jobId,
                STAGES.VISION_ANALYSIS
            )

            EventBus.publish(
                events.VISION_ANALYZE_COMPLETED,
                {
                    jobId
                }
            )


        } catch (error) {
            console.error(
                "Vision Analysis Worker Failed"
            );

            console.error(error);

            console.error(error.stack);

            await ProgressService.failStage(
                jobId,
                STAGES.VISION_ANALYSIS,
                error.message
            )

            EventBus.publish(
                events.VISION_ANALYZE_FAILED,
                {
                    jobId,
                    error: error.message
                }
            )
        }
    }
)