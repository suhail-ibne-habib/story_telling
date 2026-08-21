const DeepSeekService =
    require("./DeepSeekService");

const ScriptPromptBuilderService =
    require("./ScriptPromptBuilderService");


class ScriptGenerationService {

    async generate({
        movie,
        beat,
        visualAnalysis
    }) {

        /*
         * -----------------------------------------
         * Build prompt
         * -----------------------------------------
         */

        const prompt =
            ScriptPromptBuilderService.build({

                movie,

                beat,

                visualAnalysis

            });


        console.log(
            "\n========== SCRIPT GENERATION =========="
        );


        console.log(
            `[Script] Beat: ${beat.beatId}`
        );


        /*
         * -----------------------------------------
         * Calculate source duration
         * -----------------------------------------
         */

        const duration =
            beat.cut.endTime -
            beat.cut.startTime;


        console.log(
            `[Script] Duration: ${Number.isFinite(duration)
                ? duration.toFixed(3)
                : "unknown"
            }s`
        );


        /*
         * -----------------------------------------
         * Prompt information
         * -----------------------------------------
         */

        console.log(
            `[Script] System prompt: ${prompt.system.length
            } chars`
        );


        console.log(
            `[Script] User prompt: ${prompt.user.length
            } chars`
        );


        /*
         * -----------------------------------------
         * Send request to DeepSeek
         * -----------------------------------------
         */

        const response =
            await DeepSeekService.generate(
                prompt
            );


        console.log(
            "\n========== RAW SCRIPT RESPONSE =========="
        );


        console.log(
            response
        );


        /*
         * -----------------------------------------
         * Only check whether we received anything.
         *
         * We intentionally DO NOT:
         *
         * - JSON.parse()
         * - validate JSON
         * - validate narration
         * - calculate word count
         * - modify the response
         *
         * V1 should preserve exactly what
         * DeepSeek returned.
         * -----------------------------------------
         */

        if (
            response === undefined ||
            response === null ||
            String(response).trim() === ""
        ) {

            throw new Error(
                `DeepSeek returned an empty response for ${beat.beatId}`
            );

        }


        /*
         * -----------------------------------------
         * Return RAW DeepSeek response
         * -----------------------------------------
         */

        return String(response);

    }

}


module.exports =
    new ScriptGenerationService();