const EventBus = require('../core/EventBus')
const events = require('../events/events')
const Storage = require('../../storage/StorageService')

const path = require("path")
const fs = require('fs')
const ChunkBuilderService = require('../services/ChunkBuilderService')

EventBus.subscribe(
    events.FRAMES_COMPLETED,
    async ({ jobId }) => {
        try {
            console.log("Chunk Builder is running....")

            const paths = Storage.getPaths(jobId)

            const framesPath = path.join(paths.frames, "frames.json")
            const transcriptPath = path.join(paths.transcript, "transcript.json")
            const metadataPath = path.join(paths.metadata, 'meta_data.json')

            const [
                framesRaw,
                transcriptRaw,
                metadataRaw
            ] = await Promise.all([
                fs.promises.readFile(
                    framesPath,
                    'utf-8',
                ),

                fs.promises.readFile(
                    transcriptPath,
                    'utf-8'
                ),
                fs.promises.readFile(
                    metadataPath,
                    'utf-8'
                )]
            )

            const shots = JSON.parse(framesRaw)
            const transcriptJson = JSON.parse(transcriptRaw)
            const metadata = JSON.parse(metadataRaw)

            const transcript = transcriptJson.transcription

            const chunks = ChunkBuilderService.build(shots, transcript, metadata.duration)

            for (const chunk of chunks) {
                const filename = `${chunk.id.toLowerCase()}.json`;

                const chunkFile = path.join(paths.chunks, filename)

                await fs.promises.writeFile(
                    chunkFile,
                    JSON.stringify(
                        chunk,
                        null,
                        2
                    )
                )
            }

            console.log(
                `Built ${chunks.length} chunks`
            );

            EventBus.publish(
                events.CHUNKS_COMPLETED,
                {
                    jobId
                }
            )

        } catch (error) {
            console.error('ChunkBuilder Worker Failed ', error)
            EventBus.publish(
                events.CHUNKS_FAILED,
                {
                    jobId,
                    error: error.message
                }
            )
        }



    }
)