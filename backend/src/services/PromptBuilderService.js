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
            You are analyzing a movie scene.

            Use the transcript and attached images.

            Return only this JSON:

            {
            "summary": ""
            }

            Limit the summary to three sentences.
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