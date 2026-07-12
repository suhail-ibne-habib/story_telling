class ExplanationScriptService {
    constructor() {
        this.url = "http://localhost:11434/api/generate";
        this.model = "qwen3:4b";
    }

    async generator(storyTimeline) {

        const timelineText = storyTimeline
            .map(section => {

                const events = section.events
                    .map(event => {
                        return `[${event.start}s-${event.end}s] ${event.description}`;
                    }).join("\n");

                return `
                SECTION ${section.start}s-${section.end}s

                SUMMARY:
                ${section.summary}

                EVENTS:
                ${events}`;
            }).join("\n");

        const prompt = `
            You are writing narration for a short-form movie explanation video.

            Your job is NOT to summarize the entire movie.

            First, identify ONE interesting, unusual, dramatic, disturbing, mysterious, or emotionally compelling plot from the supplied story timeline.

            Then write a focused storytelling narration only about that plot.

            The narration style should be direct, fast, chronological, and cause-and-effect driven.

            STORY STRUCTURE:

            HOOK
            Introduce the most unusual or compelling fact immediately.

            CAUSE
            Explain how the situation began.

            ESCALATION
            Describe the connected events that make the situation worse, stranger, or more dramatic.

            TWIST OR CONSEQUENCE
            Explain the major change, discovery, betrayal, consequence, or reveal.

            ENDING
            Finish with the final outcome of this specific story.

            RULES:

            - Select only ONE focused plot.
            - Do not summarize the whole movie.
            - Ignore unrelated subplots.
            - Every narration beat must be supported by the supplied timeline.
            - Do not invent visual actions or unseen events.
            - Do not invent character names.
            - Preserve chronological cause and effect.
            - Merge related events into smooth storytelling.
            - Do not mention timestamps in the narration.
            - Do not mention the movie title.
            - Do not say "this movie is about".
            - Do not use review or analysis language.
            - Do not explain why the plot is interesting.
            - Do not mention the transcript or story timeline.
            - Start immediately with a strong direct hook.
            - Use simple spoken English suitable for voice-over.
            - Prefer short and clear sentences.
            - Return JSON only.

            STORY TIMELINE:

            ${timelineText}
        `;

        const schema = {
            type: "object",

            properties: {
                plot: {
                    type: "string"
                },

                hook: {
                    type: "string"
                },

                narration: {
                    type: "string"
                },

                sourceEvents: {
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

                            narrationBeat: {
                                type: "string"
                            }
                        },

                        required: [
                            "start",
                            "end",
                            "narrationBeat"
                        ]
                    }
                }
            },

            required: [
                "plot",
                "hook",
                "narration",
                "sourceEvents"
            ]
        };

        const response = await fetch(
            this.url,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
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
                `Explanation script model failed: ${response.status}`
            );
        }

        const result = await response.json();

        const output =
            result.response || result.thinking;

        if (!output) {
            throw new Error(
                "Explanation script model returned empty output"
            );
        }

        return JSON.parse(output);

    }
}

module.exports = new ExplanationScriptService()