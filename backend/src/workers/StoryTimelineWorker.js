const EventBus = require('../core/EventBus')
const events = require('../events/events')
const StorageService = require('../../storage/StorageService')

const path = require('path')
const fs = require('fs')
const StoryTimelineService = require('../services/StoryTimelineService')

EventBus.subscribe(
    events.TRANSCRIPT_COMPLETED,
    async ({ jobId }) => {

        try {

            // Duration
            // 1. movie metadata path
            const paths = StorageService.getPaths(jobId)
            // 2. path
            const metadataPath = path.join(
                paths.metadata,
                'meta_data.json'
            )
            // 3. read metadata
            const metadataRaw = await fs.promises.readFile(
                metadataPath,
                'utf-8'
            )

            const metadata = JSON.parse(metadataRaw)
            // 4. get duration
            const duration = metadata.duration

            // Transcript
            const transcriptPath = path.join(
                paths.transcript,
                'transcript.json'
            )

            const transcriptRaw = await fs.promises.readFile(
                transcriptPath,
                "utf-8"
            )

            const transcript = JSON.parse(transcriptRaw)

            const chunks = StoryTimelineService.chunkTranscript(transcript.transcription, duration)

            console.log(
                `Story timeline chunks: ${chunks.length}`
            );

            const timeline = [];

            for (let index = 0; index < chunks.length; index++) {
                const chunk = chunks[index];

                console.log(
                    `Analyzing story chunk ${index + 1}/${chunks.length}...`
                );

                const analysis =
                    await StoryTimelineService.analyzeChunk(
                        chunk
                    );

                timeline.push({
                    start: chunk.start,
                    end: chunk.end,
                    ...analysis
                });
            }

            // Output file
            const timelineFile = path.join(
                paths.story,
                "story_timeline.json"
            );

            await fs.promises.writeFile(
                timelineFile,
                JSON.stringify(timeline, null, 2)
            );

            EventBus.publish(
                events.STORY_TIMELINE_COMPLETED,
                {
                    jobId
                }
            );

        } catch (error) {
            console.error(
                "Story timeline worker failed:",
                error
            );

            EventBus.publish(
                events.STORY_TIMELINE_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );
        }

    }
)