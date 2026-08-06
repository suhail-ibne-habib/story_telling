class ChunkBuilderService {
    constructor() {
        this.chunkDuration = 180
    }

    // Chunk array of objs
    // shots, transcript, timeline, id

    build(
        extractedShots,
        transcript,
        movieDuration
    ) {
        const chunks = []

        let chunkIndex = 1
        let chunkStart = 0

        while (chunkStart < movieDuration) {
            const chunkEnd = Math.min(chunkStart + this.chunkDuration, movieDuration)

            const chunkId = this.buildChunkId(chunkIndex)
            const transcriptSegments = this.getTranscriptSegments(transcript, chunkStart, chunkEnd)
            const shots = this.getShots(extractedShots, chunkStart, chunkEnd)


            chunks.push({
                id: chunkId,
                timeline: {
                    start: Number(chunkStart.toFixed(3)),
                    end: Number(chunkEnd.toFixed(3)),
                    duration: Number(
                        (chunkEnd - chunkStart).toFixed(3)
                    )
                },
                transcript: transcriptSegments,
                shots
            })

            chunkStart = chunkEnd
            chunkIndex++
        }

        return chunks

    }

    buildChunkId(index) {
        return `CH${this.pad(index)}`;
    }

    pad(value) {
        return String(value).padStart(
            4,
            "0"
        );
    }

    getShots(shots, start, end) {
        return shots.filter(shot => {
            return (
                shot.start < end && shot.end > start
            )
        })
    }

    getTranscriptSegments(transcript, chunkStart, chunkEnd) {
        return transcript.filter(segment => {
            const start = segment.offsets.from / 1000
            const end = segment.offsets.to / 1000
            return (
                start < chunkEnd && end > chunkStart
            )
        })
    }


}

module.exports = new ChunkBuilderService()