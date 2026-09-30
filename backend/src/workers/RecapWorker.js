const events = require("../events/events");
const STAGES = require("../constance/pipelineStages");
const RecapService = require("../services/RecapService");
const { subscribeStage } = require("./subscribeStage");

subscribeStage({
    name: "RECAP",
    event: events.INDEX_COMPLETED,
    failEvent: events.RECAP_FAILED,
    stage: STAGES.RECAP,
    nextEvent: events.RECAP_COMPLETED,
    isDone: async (jobId) => RecapService.hasRecap(jobId),
    run: async (jobId) => {
        const result = await RecapService.extract(jobId);
        result.recaps.forEach((recap) => {
            console.log(
                `[Recap] ${recap.angle}: ${recap.beats.length} beats for "${recap.title}"`
            );
        });
    }
});
