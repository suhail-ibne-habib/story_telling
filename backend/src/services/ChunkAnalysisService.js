const PromptBuilderService = require("./PromptBuilderService");
const LLMService = require("./LLMService");

class ChunkAnalysisService {
    async analyze({ chunk, movie, characters }) {

        const prompt = PromptBuilderService.build({
            chunk,
            movie,
            characters
        });

        console.log({
            systemLength: prompt.system.length,
            userLength: prompt.user.length,
            imageCount: prompt.images.length
        });

        const response = await LLMService.generate(prompt);


        console.log("\n========== RAW LLM RESPONSE ==========\n");
        console.log(response);
        console.log("\n======================================\n");

        return response;
    }
}

module.exports = new ChunkAnalysisService();