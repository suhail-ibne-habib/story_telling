class StoryTimelineService {
    constructor() {
        this.url = "http://localhost:11434/api/generate";
        this.model = "qwen3:4b";
    }

    getChunkDuration(movieDuration) {
        if (movieDuration <= 900) {
            return movieDuration;
        }

        return 600;
    }

    chunkTranscript(transcription, movieDuration) {
        const chunks = [];

        const chunkDuration = this.getChunkDuration(
            movieDuration
        );

        const chunkDurationMs = chunkDuration * 1000;

        for (const segment of transcription) {
            const segmentStart = segment.offsets.from;

            const chunkIndex = Math.floor(
                segmentStart / chunkDurationMs
            );

            if (!chunks[chunkIndex]) {
                const start =
                    chunkIndex * chunkDuration;

                chunks[chunkIndex] = {
                    start,

                    end: Math.min(
                        start + chunkDuration,
                        movieDuration
                    ),

                    segments: []
                };
            }

            chunks[chunkIndex].segments.push(
                segment
            );
        }
        return chunks.filter(Boolean);
    }

    async analyzeChunk(chunk) {
        const transcriptText = chunk.segments
            .map(segment => {
                const start =
                    segment.offsets.from / 1000;

                return `[${start}s] ${segment.text}`;
            })
            .join("\n");

        const prompt = `
        You are analyzing a chronological section of a movie transcript.

        Transcript section:
        ${chunk.start} seconds to ${chunk.end} seconds.

        Your task is to identify story developments supported by the dialogue.

        Rules:
        - Use only information supported by the transcript.
        - Do not invent visual actions.
        - Do not guess unseen events.
        - Preserve chronological order.
        - Identify meaningful story developments, not every spoken sentence.
        - Use character names only when the transcript clearly establishes them.
        - If a character name is unknown, use a neutral description.
        - Every event must include an approximate source start and end timestamp.
        - Return JSON only.

        IMPORTANT:
        - A story event is a meaningful narrative development, not a transcript sentence.
        - Merge consecutive dialogue lines that discuss the same subject into one event.
        - Do not create an event for reactions, repeated phrases, filler dialogue, greetings, or isolated questions unless they change the story.
        - Prefer fewer, broader events.
        - Do not explain transcription errors.
        - Do not use phrases such as "likely a typo", "possibly means", or "suggests".
        - Do not speculate about relationships, motives, or unseen events.
        - Summaries must describe the narrative development directly.
        - Characters must refer only to speakers or named characters clearly established by the transcript. Do not treat a person being discussed as a character in the scene.

        - Describe dialogue and story developments factually. Do not infer emotions, relationships, intentions, or attitudes unless explicitly stated.

        - When transcript wording is unclear, preserve the broader established meaning instead of guessing or correcting specific words.

        For a short transcript section with one continuous conversation or event, returning only 1-3 events is acceptable.

        Transcript:

        ${transcriptText}`;

        const schema = {
            type: "object",

            properties: {
                summary: {
                    type: "string"
                },

                events: {
                    type: "array",

                    items: {
                        type: "object",

                        properties: {
                            start: {
                                type: "number"
                            },

                            end: {
                                type: "number"
                            },

                            description: {
                                type: "string"
                            },

                            characters: {
                                type: "array",

                                items: {
                                    type: "string"
                                }
                            }
                        },

                        required: [
                            "start",
                            "end",
                            "description",
                            "characters"
                        ]
                    }
                }
            },

            required: [
                "summary",
                "events"
            ]
        };

        const response = await fetch(
            this.url,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    model: this.model,
                    prompt,
                    format: schema,
                    stream: false
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                `Story model failed: ${response.status}`
            );
        }

        const result = await response.json();

        const output =
            result.response || result.thinking;

        if (!output) {
            throw new Error(
                "Story model returned empty output"
            );
        }

        return JSON.parse(output);
    }
}

module.exports = new StoryTimelineService()