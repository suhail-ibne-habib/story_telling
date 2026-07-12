const StorageService = require("../../storage/StorageService");
const EventBus = require("../core/EventBus");
const events = require("../events/events");
const JobService = require("../services/JobService");
const path = require('path')
const FFprobeService = require('../services/FFprobeService')
const fs = require('fs')

EventBus.subscribe(

    events.MOVIE_REGISTERED,

    async ({ jobId }) => {

        try {
            const job = JobService.get(jobId)

            const paths = StorageService.getPaths(jobId)
            const inputMovieLocation = StorageService.getInputMovie(job.filename)
            const metadata = await FFprobeService.extract(inputMovieLocation)
            const metadataFile = path.join(paths.metadata, 'meta_data.json')

            await fs.promises.writeFile(
                metadataFile,
                JSON.stringify(
                    metadata,
                    null,
                    2
                )
            )

            EventBus.publish(
                events.METADATA_COMPLETED,
                {
                    jobId
                }
            )
        } catch (error) {
            console.error("Metadata worker fails", error)

            EventBus.publish(
                events.METADATA_FAILED,
                {
                    jobId,
                    error: error.message
                }
            )
        }

    }

);