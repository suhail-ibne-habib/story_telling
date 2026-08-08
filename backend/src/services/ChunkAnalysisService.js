const ChunkPromptBuilderService = require("./ChunkPromptBuilderService");
const DeepSeekService = require('./DeepSeekService')

class ChunkAnalysisService {
    async analyze({ chunk, movie, visualAnalysis }) {

        const { system, user } = ChunkPromptBuilderService.build({
            chunk,
            movie,
            visualAnalysis
        });

        console.log({
            systemLength: system.length,
            userLength: user.length
        });

        const response = await DeepSeekService.generate({ system, user });


        console.log("\n========== RAW LLM RESPONSE ==========\n");
        console.log(response);
        console.log("\n======================================\n");

        return response;
    }
}

module.exports = new ChunkAnalysisService();