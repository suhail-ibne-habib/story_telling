const events = require("../events/events");
const STAGES = require("../constance/pipelineStages");
const CutService = require("../services/CutService");
const { subscribeStage } = require("./subscribeStage");

subscribeStage({
    name: "CUT",
    event: events.TTS_COMPLETED,
    failEvent: events.CUT_FAILED,
    stage: STAGES.CUT,
    nextEvent: events.CUT_COMPLETED,
    isDone: async (jobId) => CutService.isDone(jobId),
    run: async (jobId) => {
        const results = await CutService.cut(jobId);
        results.forEach((cut) => {
            console.log(
                `[Cut] ${cut.angle}: ${cut.beats.length} clips, ${cut.needs_review.length} need review`
            );
        });
    }
});
