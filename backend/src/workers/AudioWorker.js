const StorageService = require('../../storage/StorageService')
const EventBus = require('../core/EventBus')
const events = require('../events/events')
const FFmpegService = require('../services/FFmpegService')
const JobService = require('../services/JobService')
const path = require('path')

EventBus.subscribe(
    events.METADATA_COMPLETED,
    async ({ jobId }) => {
        try {

            console.log("Audio worker started...")
            const job = JobService.get(jobId)

            const paths = StorageService.getPaths(jobId)
            const inputMovieLocation = StorageService.getInputMovie(job.filename)

            const outputAudio = path.join(paths.audio, 'audio.wav')

            await FFmpegService.extractAudio(inputMovieLocation, outputAudio)

            EventBus.publish(
                events.AUDIO_COMPLETED,
                {
                    jobId
                }
            )

        } catch (error) {
            console.error("Audio worker fails ", error)

            EventBus.publish(
                events.AUDIO_FAILED,
                {
                    jobId,
                    error: error.message
                }
            )
        }
    }
)