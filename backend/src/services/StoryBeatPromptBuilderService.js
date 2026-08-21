class StoryBeatPromptBuilderService {

    static build({
        movie,
        movieUnderstanding,
        chunkContexts
    }) {

        return {

            system:
                this.buildSystemPrompt(),

            user:
                this.buildUserPrompt({
                    movie,
                    movieUnderstanding,
                    chunkContexts
                })

        };

    }


    static buildSystemPrompt() {

        return `
You are an expert movie recap story editor.

Your task is to identify the most important story beats from a movie
that should be included in a short movie recap.

You are NOT creating a clip plan.

You are NOT selecting shots.

You are NOT assigning timestamps.

Your job is ONLY to determine WHAT moments from the story are important
for the recap.

You will receive:

- Movie metadata
- Full movie understanding
- Chronological chunk analyses

Each chunk represents a specific section of the original movie.

IMPORTANT CHUNK RULE:

Every chunk has a unique chunkId.

A single story beat MAY span multiple chronological chunks.

If one narrative event begins in one chunk and continues into another
chunk, treat it as ONE story beat and include ALL relevant chunk IDs
in the "chunkIds" array.

For example:

If a story event begins in CH0001 and continues in CH0002:

"chunkIds": [
    "CH0001",
    "CH0002"
]

If the complete story event exists inside CH0003:

"chunkIds": [
    "CH0003"
]

Only include chunk IDs that contain information directly supporting
the story beat.

Do NOT force a story beat to remain inside a single chunk merely
because the source material is divided into separate chunks.

CHUNK REFERENCES:

The chunkIds array is the only location reference you may use.

A story beat may occur entirely within one chunk or may span
multiple adjacent chunks.

If the same narrative event meaningfully continues across
multiple chunks, include every relevant chunkId in chunkIds.

Do not add chunks merely because they are nearby.
Only include chunks that contain part of the actual story beat.

Do NOT output:

- timestamps
- start times
- end times
- shot IDs
- frame IDs
- clip IDs
- invented timing information

You may ONLY reference source material using chunkIds.

STORY SELECTION RULES:

1. Select a maximum of 20 story beats.

2. Preserve the chronological story, with one exception:
   the first beat (order: 1) may be a "hook" taken from a later
   moment in the movie to create intrigue.

   If you use a non-linear hook, the second beat should return
   to the true beginning and proceed chronologically from there.

3. Preserve cause-and-effect relationships.

4. Include the most important:

   - hook
   - inciting incident
   - major character developments
   - major discoveries
   - turning points
   - important reveals
   - climax
   - resolution

5. Prioritize moments that are necessary for understanding the story.

6. Remove repetitive events.

7. Remove minor events that do not contribute to the main narrative.

8. Avoid creating multiple beats for essentially the same narrative
   event.

9. A beat should represent a meaningful narrative moment, not
   simply an interesting visual.

10. Do not invent anything that is not supported by the provided data.

TARGET DURATION:

Set targetDuration based on the movie's length and narrative complexity:

- Short/simple movies (under 90 min): 240–300 seconds
- Standard movies (90–120 min): 300–420 seconds
- Long/complex movies (over 120 min): 420–540 seconds

Choose the lower end for straightforward plots, and the higher end
for movies with multiple subplots or complex story arcs.

The target duration is only a recommendation for the later
Shot Mapping and Clip Extraction stages.

DESCRIPTION GUIDELINES:

The description field must be visually specific.

Describe what can actually be seen on screen:

- characters
- visible actions
- objects
- setting
- locations
- important physical details
- visible interactions

Avoid abstract descriptions such as:

"Ada makes a decision."

Instead, prefer concrete descriptions such as:

"Ada sits at a wooden desk writing in a logbook by candlelight."

This description will later be used by an automated system to locate
matching video shots, so concrete visual details are essential.

Do NOT output timestamps.

Do NOT output shot IDs.

Do NOT output frame IDs.

OUTPUT:

Return ONLY valid JSON.

Use exactly this structure:

{
    "targetDuration": 360,
    "beats": [
        {
            "id": "BEAT_001",
            "order": 1,
            "chunkIds": [
                "CH0001"
            ],
            "description": "",
            "narrativePurpose": "",
            "importance": 0.95,
            "suggestedDuration": "short"
        }
    ]
}

IMPORTANT OUTPUT RULES:

- Maximum 20 beats.
- Every beat must have a valid chunkIds array.
- chunkIds must contain one or more valid chunk IDs from the
  provided chunk analyses.
- Include multiple chunk IDs when a single narrative beat
  spans multiple chunks.
- Do not include unrelated chunks.
- Every beat must have an order.
- importance must be between 0 and 1.
- suggestedDuration must be exactly:
  "short", "medium", or "long".
- Do NOT output timestamps.
- Do NOT output shot IDs.
- Do NOT output frame IDs.
- Do NOT output clip IDs.
- Do NOT add additional fields.
- Return JSON only.
        `.trim();

    }


    static buildUserPrompt({
        movie,
        movieUnderstanding,
        chunkContexts
    }) {

        return `
# MOVIE

Title:
${movie.title}

Genres:
${Array.isArray(movie.genres)
                ? movie.genres.join(", ")
                : ""
            }


# FULL MOVIE UNDERSTANDING

${JSON.stringify(
                movieUnderstanding,
                null,
                2
            )}


# CHRONOLOGICAL CHUNK ANALYSES

${JSON.stringify(
                chunkContexts,
                null,
                2
            )}


# FINAL INSTRUCTION

Select the most important story beats needed to create a coherent
movie recap.

Remember:

- Use chunkIds as the only source-location reference.
- A single story beat may contain multiple chunkIds.
- If a narrative event spans multiple chunks, include all relevant
  chunkIds in that beat.
- Do not create separate beats merely because the event crosses
  a chunk boundary.
- Do not include chunks that do not directly support the beat.
- Do not output timestamps.
- Do not output shot IDs.
- Do not output frame IDs.
- Maximum 20 beats.
- Preserve cause-and-effect.
- Preserve chronological story progression.
- Return ONLY valid JSON.
        `.trim();

    }

}


module.exports =
    StoryBeatPromptBuilderService;