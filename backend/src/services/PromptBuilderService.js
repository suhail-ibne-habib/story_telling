class PromptBuilderService {
    /**
     * Build the complete prompt for analyzing a movie chunk.
     *
     * @param {Object} params
     * @param {Object} params.chunk
     * @param {Object} params.movie
     * @param {Array} params.characters
     *
     * @returns {{
     *   system: string,
     *   user: string,
     *   images: string[]
     * }}
     */
    static build({ chunk, movie, characters }) {
        return {
            system: this.buildSystemPrompt(),
            user: this.buildUserPrompt(chunk, movie, characters),
            images: this.collectImages(chunk)
        };
    }

    static buildSystemPrompt() {
        return `
        You are an expert movie scene analyst.

        Your task is to analyze ONE chronological movie chunk.

        You will receive:

        - Movie metadata
        - Known characters
        - A transcript for this chunk
        - Representative images attached separately

        Analyze ONLY the provided chunk.

        Guidelines:

        - Use both the transcript and the images.
        - Never invent information.
        - If something cannot be determined, return null.
        - Preserve chronological order.
        - Base every conclusion only on the provided evidence.
        - Ignore insignificant dialogue and background conversation.
        - Do not explain your reasoning.
        - Do not write markdown.
        - Return ONLY valid JSON.

        Your goal is NOT to recap the movie.

        Your goal is to extract the important story information contained in this chunk.

        Return JSON in exactly this format:

        {
        "summary": "A concise summary (2-4 sentences).",

        "events": [
            {
            "id": "E001",
            "time": 0,
            "importance": "high",
            "description": "",
            "characters": [],
            "objects": [],
            "location": null
            }
        ]
        }
        `.trim();
    }

    static buildUserPrompt(chunk, movie) {

        const transcript = chunk.transcript
            .map(segment => segment.text.trim())
            .join("\n");

        return `
            Movie
            -----

            Title: ${movie.title}

            Genres: ${movie.genres.join(", ")}

            Timeline
            --------

            ${chunk.timeline.start}s - ${chunk.timeline.end}s

            Transcript
            ----------

            ${transcript}

            Representative contact sheets are attached as images in chronological order.
            `.trim();

    }

    static collectImages(chunk) {
        const images = [];

        for (const sheetObj of chunk.contactSheets) {
            images.push(sheetObj.path);
        }

        return images;
    }
}

module.exports = PromptBuilderService;