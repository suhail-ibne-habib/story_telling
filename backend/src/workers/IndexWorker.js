const events = require("../events/events");
const STAGES = require("../constance/pipelineStages");
const MovieIndexService = require("../services/MovieIndexService");
const GetFileName = require("../core/GetFileName");
const { subscribeStage } = require("./subscribeStage");

subscribeStage({
    name: "INDEX",
    event: events.METADATA_COMPLETED,
    failEvent: events.INDEX_FAILED,
    stage: STAGES.INDEX,
    nextEvent: events.INDEX_COMPLETED,
    isDone: async (jobId) => MovieIndexService.isReady(
        await GetFileName.getFileName(jobId)
    ),
    run: async (jobId) => {
        const filename = await GetFileName.getFileName(jobId);
        const index = await MovieIndexService.build(filename);
        console.log(
            `[Index] ${index.scenes.length} scenes indexed for "${filename}"`
        );
    }
});
