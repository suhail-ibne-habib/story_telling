const MovieUnderstandingPromptBuilderService =
    require("./MovieUnderstandingPromptBuilderService");

const DeepSeekService =
    require("./DeepSeekService");


class MovieUnderstandingService {

    async analyze({
        movie,
        chunkAnalyses
    }) {

        const {
            system,
            user
        } = MovieUnderstandingPromptBuilderService.build({
            movie,
            chunkAnalyses
        });


        console.log({
            systemLength: system.length,
            userLength: user.length,
            chunkCount: chunkAnalyses.length
        });


        const response =
            await DeepSeekService.generate({
                system,
                user
            });


        console.log(
            "\n========== MOVIE UNDERSTANDING ==========\n"
        );

        console.log(response);

        console.log(
            "\n=========================================\n"
        );


        return response;

    }

}


module.exports =
    new MovieUnderstandingService();