class MovieUnderstandingPromptBuilderService {

    static build({
        movie,
        chunkAnalyses
    }) {

        return {
            system: this.buildSystemPrompt(),

            user: this.buildUserPrompt({
                movie,
                chunkAnalyses
            })
        };

    }


    static buildSystemPrompt() {

        return `
    You are an expert movie story analyst.

    Your task is to understand the COMPLETE movie using
    structured analysis from individual chronological chunks.

    You will receive:

    - Movie metadata
    - Chunk analyses in chronological order

    Each chunk analysis describes what happens locally
    within that part of the movie.

    Your job is to connect those local events into a
    GLOBAL understanding of the movie.

    Analyze:

    1. Overall story
    2. Main characters
    3. Character goals and motivations
    4. Character relationships
    5. Main conflicts
    6. Major story arcs
    7. Major events
    8. Important turning points
    9. Cause-and-effect relationships
    10. Setup and payoff relationships
    11. Climax
    12. Resolution

    Important rules:

    - Analyze ONLY the information provided.
    - Do not use outside knowledge.
    - Do not invent events.
    - Do not assume information that is not supported.
    - Preserve chronological relationships.
    - Distinguish important story events from minor events.
    - Connect events when the provided information supports a relationship.
    - Do not confuse visual observations with confirmed story facts.
    - Do not write a movie review.
    - Do not write narration.
    - This is a structured story-understanding stage.

    Return ONLY valid JSON.

    {
        "story": {
            "premise": "",
            "summary": "",
            "centralConflict": "",
            "climax": "",
            "resolution": ""
        },

        "characters": [
            {
                "id": "",
                "name": "",
                "role": "",
                "goal": "",
                "motivation": "",
                "arc": ""
            }
        ],

        "relationships": [
            {
                "from": "",
                "to": "",
                "type": "",
                "description": ""
            }
        ],

        "storyArcs": [
            {
                "id": "",
                "name": "",
                "description": "",
                "startTime": null,
                "endTime": null,
                "events": []
            }
        ],

        "majorEvents": [
            {
                "id": "",
                "time": null,
                "importance": "",
                "description": "",
                "cause": "",
                "effect": "",
                "characters": []
            }
        ],

        "turningPoints": [
            {
                "id": "",
                "time": null,
                "description": "",
                "whyItMatters": ""
            }
        ],

        "causeEffects": [
            {
                "causeEventId": "",
                "effectEventId": "",
                "relationship": ""
            }
        ],

        "setupPayoffs": [
            {
                "setupEventId": "",
                "payoffEventId": "",
                "description": ""
            }
        ]
    }
    `.trim();

    }


    static buildUserPrompt({
        movie,
        chunkAnalyses
    }) {

        const chunks = chunkAnalyses
            .map((analysis, index) => {

                return `
    CHUNK ${index + 1}
    ----------------

    ${JSON.stringify(analysis, null, 2)}
    `;

            })
            .join("\n");


        return `
    MOVIE
    =====

    Title:
    ${movie.title}

    Genres:
    ${movie.genres.join(", ")}


    CHRONOLOGICAL CHUNK ANALYSES
    ============================

    ${chunks}

    Build a global understanding of the complete movie
    using the chronological chunk analyses above.
    `.trim();

    }

}


module.exports = MovieUnderstandingPromptBuilderService;