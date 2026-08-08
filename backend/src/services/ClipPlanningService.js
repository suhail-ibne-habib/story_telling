const ClipPromptBuilderService =
    require("./ClipPromptBuilderService");

const DeepSeekService =
    require("./DeepSeekService");


class ClipPlanningService {

    async analyze({
        movie,
        movieUnderstanding,
        chunkContexts
    }) {

        const {
            system,
            user
        } = ClipPromptBuilderService.build({
            movie,
            movieUnderstanding,
            chunkContexts
        });

        console.log({
            systemLength: system.length,
            userLength: user.length,
            chunks: chunkContexts.length
        });

        const response =
            await DeepSeekService.generate({
                system,
                user
            });

        console.log(
            "\n========== RAW CLIP PLAN ==========\n"
        );

        console.log(response);

        console.log(
            "\n===================================\n"
        );

        return response;

    }

}

module.exports =
    new ClipPlanningService();