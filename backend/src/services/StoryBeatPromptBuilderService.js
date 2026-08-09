class StoryBeatPromptBuilderService {

    static build({
        movie,
        movieUnderstanding,
        chunkContexts
    }) {

        return {
            system: this.buildSystemPrompt(),

            user: this.buildUserPrompt({
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

IMPORTANT:

The chunkId is the only location reference you may use.

Do NOT output:

- timestamps
- start times
- end times
- shot IDs
- frame IDs
- clip IDs
- invented timing information

You may ONLY reference the original chunk using its chunkId.

STORY SELECTION RULES:

1. Select a maximum of 20 story beats.

2. Preserve the chronological story, with one exception: the first beat (order: 1) may be a "hook" taken from a later moment in the movie to create intrigue. If you use a non-linear hook, the second beat should return to the true beginning and proceed chronically from there.

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

8. Do not select two beats from the same chunk if they describe
   essentially the same action or story event.

9. A beat should represent a meaningful narrative moment, not
   simply an interesting visual.

10. Do not invent anything that is not supported by the provided data.

TARGET DURATION:

Set targetDuration based on the movie's length and narrative complexity:
- Short/simple movies (under 90 min): 240–300 seconds
- Standard movies (90–120 min): 300–420 seconds  
- Long/complex movies (over 120 min): 420–540 seconds

Choose the lower end for straightforward plots, the higher end for movies with multiple subplots or complex arcs.

The duration is only a recommendation for the later ShotMapper.

DESCRIPTION GUIDELINES:

The description field must be visually specific. Describe what can actually be seen on screen (characters, actions, objects, setting). Avoid abstract summaries like "Ada makes a decision" or "The conflict escalates." Instead, write "Ada sits at a wooden desk writing in a logbook by candlelight" or "Fiddler points a revolver at a bloodied man near a campfire."

This description will be used by an automated system to find matching video shots, so concrete visual details are essential.

Do NOT output timestamps.

OUTPUT:

Return ONLY valid JSON.

Use exactly this structure:

{
    "targetDuration": 360,
    "beats": [
        {
            "id": "BEAT_001",
            "order": 1,
            "chunkId": "CH0001",
            "description": "",
            "narrativePurpose": "",
            "importance": 0.95,
            "suggestedDuration": "short"
        }
    ]
}

IMPORTANT:

- Maximum 20 beats.
- Every beat must have a valid chunkId.
- Every beat must have an order.
- importance must be between 0 and 1.
- suggestedDuration must be exactly:
  "short", "medium", or "long".
- No timestamps.
- No shot IDs.
- No frame IDs.
- No additional fields.
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

- Use chunkId only as the location reference.
- Do not output timestamps.
- Do not output shot IDs.
- Do not output frame IDs.
- Maximum 20 beats.
- Preserve cause-and-effect.
- Preserve chronological order.
- Return ONLY valid JSON.
`.trim();

    }

}


module.exports = StoryBeatPromptBuilderService;