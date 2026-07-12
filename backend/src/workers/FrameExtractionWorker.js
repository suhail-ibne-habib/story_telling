const EventBus = require('../core/EventBus')
const events = require('../events/events')
const StorageService = require('../../storage/StorageService')
const JobService = require('../services/JobService')

const path = require('path')
const fs = require('fs')
const FrameExtractionService = require('../services/FrameExtractionService')

EventBus.subscribe(
    events.SHOTS_COMPLETED,
    async ({ jobId }) => {
        try {

            console.log("Frames extraction started....")

            // Job Id
            const job = JobService.get(jobId)

            // Input Movie Path
            const moviePath = StorageService.getInputMovie(job.filename)

            // shots path
            const paths = StorageService.getPaths(jobId)

            const shotsFile = path.join(
                paths.shots,
                'shots.json'
            )

            const shotsRaw = await fs.promises.readFile(
                shotsFile,
                'utf-8'
            )

            const shots = JSON.parse(shotsRaw)

            // Extracting Frames
            for (const shot of shots) {
                const timestamp = shot.start + shot.duration / 2

                const outputName = `shot_${String(shot.id).padStart(3, "0")}.jpg`;

                const outputFile = path.join(
                    paths.frames,
                    outputName
                )

                await FrameExtractionService.extract(moviePath, timestamp, outputFile)
            }

            // Output File Generation

            EventBus.publish(
                events.FRAMES_COMPLETED,
                {
                    jobId
                }
            )

        } catch (error) {
            console.error("Frames extraction failed! ", error)

            EventBus.publish(
                events.FRAMES_FAILED,
                {
                    jobId,
                    error: error.message
                }
            )
        }
    }
)