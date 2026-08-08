const LLMService = require("./LLMService");
const VisionPromptBuilderService = require("./VisionPromptBuilderService");

class VisionAnalysisService {

    async analyze({ chunk, contactSheet }) {
        const prompt = VisionPromptBuilderService.build({
            chunk,
            contactSheet
        })

        console.log({
            systemLength: prompt.system.length,
            userLength: prompt.user.length,
            imageCount: prompt.images.length
        })

        const response = await LLMService.generate(prompt)

        return response.content;
    }


}

module.exports = new VisionAnalysisService()