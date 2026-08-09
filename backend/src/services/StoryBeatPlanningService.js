const StoryBeatPromptBuilderService = require("./StoryBeatPromptBuilderService");
const DeepSeekService = require('./DeepSeekService')

class StoryBeatPlanningService {

    async analyze({
        movie,
        movieUnderstanding,
        chunkContexts
    }) {
        const { system, user } = StoryBeatPromptBuilderService.build({
            movie,
            movieUnderstanding,
            chunkContexts
        })

        console.log("\n========== STORY BEAT PLANNING ==========");
        console.log("Preparing DeepSeek request...");

        console.log("Sending request to DeepSeek...");

        const response = await DeepSeekService.generate({
            system,
            user
        })

        console.log("DeepSeek story beat response received.");

        return response
    }

}

module.exports = new StoryBeatPlanningService()