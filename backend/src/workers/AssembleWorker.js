const events = require("../events/events");
const STAGES = require("../constance/pipelineStages");
const AssembleService = require("../services/AssembleService");
const { subscribeStage } = require("./subscribeStage");

subscribeStage({
    name: "ASSEMBLE",
    event: events.CUT_COMPLETED,
    failEvent: events.ASSEMBLE_FAILED,
    stage: STAGES.ASSEMBLE,
    nextEvent: events.ASSEMBLE_COMPLETED,
    completeJob: true,
    isDone: async (jobId) => AssembleService.isDone(jobId),
    run: async (jobId) => {
        const result = await AssembleService.assemble(jobId);
        result.videos.forEach((video) => {
            console.log(
                `[Assemble] ${video.angle}: ${video.file} (${video.duration_sec.toFixed(1)}s)`
            );
        });
    }
});
