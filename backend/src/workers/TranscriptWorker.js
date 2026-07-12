const path = require('path')
const EventBus = require('../core/EventBus')
const events = require('../events/events')
const StorageService = require('../../storage/StorageService')
const WhisperService = require('../services/WhisperService')

EventBus.subscribe(
    events.AUDIO_COMPLETED,

    async ({ jobId }) => {
        try {

            console.log("Transcript worker started..")
            const paths = StorageService.getPaths(jobId)

            const audioFile = path.join(
                paths.audio,
                'audio.wav'
            )

            const outputPrefix = path.join(
                paths.transcript,
                'transcript'
            )

            await WhisperService.transcribe(audioFile, outputPrefix)

            EventBus.publish(
                events.TRANSCRIPT_COMPLETED,
                {
                    jobId
                }
            )

        } catch (error) {
            console.error('Transcript worker failed', error)
            EventBus.publish(
                events.TRANSCRIPT_FAILED,
                {
                    jobId
                }
            )
        }
    }
)