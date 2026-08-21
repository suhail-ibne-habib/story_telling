class ChunkPromptBuilderService {

    static build({
        movie,
        chunk,
        visualAnalysis
    }) {

        return {

            system:
                this.buildSystemPrompt(),

            user:
                this.buildUserPrompt({
                    movie,
                    chunk,
                    visualAnalysis
                })

        };

    }


    static buildSystemPrompt() {

        return `
You are an expert movie scene analyst.

Your task is to analyze ONE chronological movie chunk.

You will receive three sources of information:

1. MOVIE METADATA
2. TRANSCRIPT
3. VISUAL ANALYSIS

The VISUAL ANALYSIS was generated previously by a computer vision model.
It describes what is visibly present in individual frames and includes timestamps.

The TRANSCRIPT describes spoken dialogue or narration.

Your job is to combine these sources into a structured chronological
understanding of what happens in this specific chunk.

IMPORTANT RULES:

- Analyze ONLY the provided chunk.
- Do NOT identify the movie beyond the provided metadata.
- Do NOT use outside knowledge.
- Do NOT invent characters, locations, objects, actions, or events.
- Do NOT infer information that is not supported by the transcript
  or visual analysis.
- Do NOT treat visual observations as more certain than what is actually visible.
- Do NOT treat transcript dialogue as proof that an action occurred visually.
- When transcript and visual analysis disagree, keep the distinction clear.
- Use timestamps from the visual analysis when available.
- Keep events in chronological order.
- Combine closely related observations into meaningful events.
- Do not create one event for every frame.
- Focus on meaningful changes, actions, interactions, dialogue,
  locations, objects, and scene developments.
- Do not summarize the entire movie.
- Do not analyze events outside this chunk.

CHARACTERS:

Only mention a character by name if the provided information explicitly
identifies that person by name.

Otherwise use neutral descriptions such as:

- "a young person"
- "a man"
- "a woman"
- "a person"
- "three people"

Do not guess actor identities or character identities.

TIMESTAMPS:

Use the timestamp from the visual analysis when an event is visually
anchored to a specific frame.

If an event comes only from the transcript and no matching visual
timestamp is available, use the nearest supported timestamp from the
transcript if available.

Do not invent precise timestamps.

EVENT IMPORTANCE:

Use only:

- "low"
- "medium"
- "high"
- "critical"

Importance should reflect how significant the event is within THIS chunk,
not the entire movie.

OUTPUT:

Return ONLY valid JSON.

Do not return markdown.

Do not wrap the response in \`\`\`json.

Do not include explanations before or after the JSON.

Return exactly this structure:

{
    "summary": "",
    "events": [
        {
            "id": "E001",
            "time": "hh:mm:ss",
            "importance": "medium",
            "description": "",
            "characters": [],
            "objects": [],
            "location": null
        }
    ]
}

FIELD RULES:

summary:
A concise description of what happens in this chunk.

events:
Meaningful chronological events derived from the provided sources.

id:
Sequential event identifier beginning with E001.

time:
The most appropriate timestamp in seconds.
Use a number when supported.
Use null when a reliable timestamp cannot be established.

importance:
One of low, medium, high, critical.

description:
A factual description of what happens.
Clearly distinguish visible actions from spoken information when necessary.

characters:
Only names or neutral descriptions supported by the input.

objects:
Only objects explicitly supported by the input.

location:
Only provide a location when supported by the input.
Otherwise use null.
`.trim();

    }


    static buildUserPrompt({
        movie,
        chunk,
        visualAnalysis
    }) {

        const transcript =
            Array.isArray(chunk.transcript)
                ? chunk.transcript
                    .map(segment => {

                        const start =
                            segment.start ??
                            segment.startTime ??
                            null;

                        const end =
                            segment.end ??
                            segment.endTime ??
                            null;

                        const text =
                            segment.text?.trim() || "";

                        if (!text) {
                            return "";
                        }

                        if (
                            start !== null &&
                            end !== null
                        ) {

                            return `[${start}s - ${end}s] ${text}`;

                        }

                        if (start !== null) {

                            return `[${start}s] ${text}`;

                        }

                        return text;

                    })
                    .filter(Boolean)
                    .join("\n")
                : "";


        return `
MOVIE METADATA
==============

Title:
${movie?.title || "Unknown"}

Genres:
${Array.isArray(movie?.genres)
                ? movie.genres.join(", ")
                : "Unknown"
            }


CHUNK TIMELINE
==============

Start:
${chunk?.timeline?.start ?? "Unknown"} seconds

End:
${chunk?.timeline?.end ?? "Unknown"} seconds


TRANSCRIPT
==========

${transcript || "No transcript available."}


VISUAL ANALYSIS
===============

The following observations were generated by the vision-analysis stage.

Use them as visual evidence for this chunk.

${visualAnalysis || "No visual analysis available."}


TASK
====

Combine the transcript and visual analysis into a chronological,
fact-based understanding of this chunk.

Identify meaningful events and return ONLY the required JSON structure.
`.trim();

    }

}


module.exports = ChunkPromptBuilderService;