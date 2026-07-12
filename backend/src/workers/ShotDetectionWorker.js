const fs = require('fs')
const path = require('path')

const EventBus = require('../core/EventBus')
const events = require('../events/events')
const JobService = require('../services/JobService')
const StorageService = require('../../storage/StorageService')
const ShotDetectionService = require('../services/ShotDetectionService')

EventBus.subscribe(
    events.TRANSCRIPT_COMPLETED,
    async ({ jobId }) => {
        try {
            const job = JobService.get(jobId)

            const paths = StorageService.getPaths(jobId)

            const metadataFile = path.join(
                paths.metadata,
                'meta_data.json'
            )

            const metadataRaw = await fs.promises.readFile(
                metadataFile,
                "utf-8"
            )

            const metadataJson = JSON.parse(metadataRaw)

            const inputMovie = StorageService.getInputMovie(job.filename)

            const movieDuration = metadataJson.duration;

            const shots = await ShotDetectionService.detect(inputMovie, movieDuration)

            const shotFile = path.join(
                paths.shots,
                'shots.json'
            )

            await fs.promises.writeFile(
                shotFile,
                JSON.stringify(
                    shots,
                    null,
                    2
                )
            )

            EventBus.publish(
                events.SHOTS_COMPLETED,
                {
                    jobId
                }
            )

        } catch (error) {
            console.error('Shots detection failed! ', error)

            EventBus.publish(
                events.SHOTS_FAILED,
                {
                    jobId,
                    error: error.message
                }
            )
        }
    }
)