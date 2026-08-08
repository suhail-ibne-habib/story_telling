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
            You are an expert movie analyst.

            Your task is to analyze ONE chronological movie chunk.

            You will receive:

            - Movie metadata
            - Transcript
            - Visual observations generated from a vision model

            The visual observations describe what is visible.
            The transcript describes what was spoken.

            Combine both sources.

            Do not invent information.

            Do not use outside knowledge.

            Analyze ONLY this chunk.

            Return ONLY the JSON object.

            Do not wrap it inside markdown.

            Do not write "json", "",

            Do not explain your answer.

            Do not include any text before or after the JSON.

            {
                "summary": "",

                "events": [

                    {
                        "id": "",
                        "time": null,
                        "importance": "",
                        "description": "",
                        "characters": [],
                        "objects": [],
                        "location": null
                    }

                ]

            }
            `.trim();

    }

    static buildUserPrompt({
        movie,
        chunk,
        visualAnalysis
    }) {

        const transcript =
            chunk.transcript
                .map(segment => segment.text.trim())
                .join("\n");

        return `
                Movie
                =====

                Title: ${movie.title}

                Genres: ${movie.genres.join(", ")}

                Timeline:
                ${chunk.timeline.start}s - ${chunk.timeline.end}s


                ==============================
                TRANSCRIPT
                ==============================

                ${transcript}


                ==============================
                VISUAL ANALYSIS
                ==============================

                ${visualAnalysis}
            `.trim();

    }

}

module.exports = ChunkPromptBuilderService;