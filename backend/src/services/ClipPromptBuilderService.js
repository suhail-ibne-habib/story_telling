class ClipPromptBuilderService {

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
You are an expert movie recap editor.

Your task is to create a chronological clip plan for a movie recap.

You will receive:

- Movie metadata
- Full movie understanding
- Chronological chunk contexts

Each chunk context contains:

- The original chunk timeline
- The analyzed story events from that chunk

Your job is to select the moments that should actually appear in the recap.

The selected clips must:

- Tell the story coherently from beginning to end
- Preserve important cause-and-effect relationships
- Include major plot developments
- Include important character developments
- Include important reveals and turning points
- Include the climax and resolution when available
- Avoid repetitive or unnecessary moments
- Follow the original movie chronology

IMPORTANT:

The timeline from the original chunk is the source of truth for timing.

Do not invent timestamps.

If an event cannot be assigned to an exact timestamp, use the containing chunk timeline.

Do not use outside knowledge.

Do not invent scenes, events, characters, locations, or actions.

Return ONLY valid JSON.

Use this structure:

{
    "clips": [
        {
            "id": "CL001",
            "start": 0,
            "end": 0,
            "purpose": "",
            "importance": "high",
            "summary": "",
            "reason": "",
            "relatedEvents": []
        }
    ]
}
`.trim();

    }

    static buildUserPrompt({
        movie,
        movieUnderstanding,
        chunkContexts
    }) {

        return `
MOVIE
=====

Title:
${movie.title}

Genres:
${movie.genres.join(", ")}


FULL MOVIE UNDERSTANDING
========================

${JSON.stringify(
            movieUnderstanding,
            null,
            2
        )}


CHRONOLOGICAL CHUNK CONTEXTS
============================

${JSON.stringify(
            chunkContexts,
            null,
            2
        )}

`.trim();

    }

}

module.exports = ClipPromptBuilderService;