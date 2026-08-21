class ScriptPromptBuilderService {

    static build({
        movie,
        beat,
        visualAnalysis
    }) {

        const duration =
            beat.cut.endTime -
            beat.cut.startTime;

        const maxWords =
            Math.floor(duration * 2.5);

        const targetWords =
            Math.max(
                1,
                Math.floor(maxWords * 0.9)
            );


        console.log(
            `[ScriptGeneration] Visual analysis count: ${visualAnalysis.length}`
        );

        console.dir(
            visualAnalysis,
            {
                depth: null
            }
        );

        return {

            system:
                this.buildSystemPrompt({
                    duration,
                    targetWords,
                    maxWords
                }),

            user:
                this.buildUserPrompt({
                    movie,
                    beat,
                    visualAnalysis,
                    duration,
                    targetWords,
                    maxWords
                })

        };

    }


    static buildSystemPrompt({
        duration,
        targetWords,
        maxWords
    }) {

        return `
            You are an expert movie recap script writer.

            Your task is to write narration for ONE selected movie beat.

            The original movie audio, dialogue, narration and subtitles will NOT be used.

            The narration will be played over the selected video clips.

            Therefore, the narration MUST match the footage.

            CRITICAL RULES:

            1. Analyze ONLY the supplied information.

            2. Do not use outside knowledge.

            3. Do not invent events that are not supported by the supplied
            visual analysis or beat information.

            4. Follow the chronological order of the selected shots.

            5. The narration must describe the story progression represented
            by the selected footage.

            6. Do not describe every camera movement or frame unnecessarily.

            7. The narration should sound natural and engaging, like a
            professional movie recap.

            8. Do not write dialogue as if you are reproducing the movie's
            original dialogue.

            9. Do not mention timestamps in the narration.

            10. Do not mention "the camera", "the shot", "the frame",
                "the footage", or "the contact sheet".

            11. Do not introduce information that happens outside this beat.

            12. The narration MUST fit inside the available video duration.

            This beat has:

            Duration:
            ${duration.toFixed(3)} seconds

            Target narration length:
            approximately ${targetWords} words

            Maximum narration length:
            ${maxWords} words

            The narration must NOT exceed ${maxWords} words.

            Return ONLY valid JSON.

            Return exactly:

            {
                "beatId": "",
                "duration": <number>,
                "wordCount": <number>,
                "narration": ""
            }

            Do not include markdown.
            Do not include \`\`\`json.
            Do not include explanations before or after the JSON.
                    `.trim();

    }


    static buildUserPrompt({
        movie,
        beat,
        visualAnalysis,
        duration,
        targetWords,
        maxWords
    }) {

        const shots =
            beat.selectedShots
                .map(shot => {

                    return `
            Shot ${shot.shotId}

            Start:
            ${shot.startTime}s

            End:
            ${shot.endTime}s

            Duration:
            ${(
                            shot.endTime -
                            shot.startTime
                        ).toFixed(3)}s

            Selection reason:
            ${shot.reason}
                                `.trim();

                })
                .join("\n\n");


        return `
            MOVIE
            =====

            Title:
            ${movie.title || "Unknown"}

            Genres:
            ${Array.isArray(movie.genres)
                ? movie.genres.join(", ")
                : ""
            }


            BEAT
            ====

            Beat ID:
            ${beat.beatId}

            Beat duration:
            ${duration.toFixed(3)} seconds

            Narration target:
            approximately ${targetWords} words

            Maximum:
            ${maxWords} words


            SELECTED SHOTS
            ==============

            ${shots}


            VISUAL ANALYSIS
            ===============

            ${visualAnalysis || "No visual analysis available."}


            TASK
            ====

            Write a natural movie-recap narration for this beat.

            The narration must follow the selected shots chronologically.

            The viewer will see ONLY these selected clips while hearing
            your narration.

            Make sure every important statement is supported by the
            provided information.

            Keep the narration within the ${maxWords}-word maximum.

            Return ONLY the required JSON object.
        `.trim();

    }

}


module.exports =
    ScriptPromptBuilderService;