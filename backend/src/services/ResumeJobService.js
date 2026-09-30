const Storage = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const EventBus = require("../core/EventBus");
const RecapService = require("./RecapService");
const MovieIndexService = require("./MovieIndexService");
const VoiceoverService = require("./VoiceoverService");
const CutService = require("./CutService");
const AssembleService = require("./AssembleService");
const GetFileName = require("../core/GetFileName");

const events = require("../events/events");
const STAGES = require("../constance/pipelineStages");

const fs = require("fs");
const path = require("path");

const PIPELINE_STAGES = [
    STAGES.METADATA,
    STAGES.INDEX,
    STAGES.RECAP,
    STAGES.TTS,
    STAGES.CUT,
    STAGES.ASSEMBLE
];

const STAGE_START_EVENT = {
    [STAGES.METADATA]: events.MOVIE_REGISTERED,
    [STAGES.INDEX]: events.METADATA_COMPLETED,
    [STAGES.RECAP]: events.INDEX_COMPLETED,
    [STAGES.TTS]: events.RECAP_COMPLETED,
    [STAGES.CUT]: events.TTS_COMPLETED,
    [STAGES.ASSEMBLE]: events.CUT_COMPLETED
};

class ResumeJobService {

    async artifactReady(jobId, stage) {
        const paths = Storage.getPaths(jobId);

        switch (stage) {
            case STAGES.METADATA:
                return fs.existsSync(
                    path.join(paths.metadata, "meta_data.json")
                );
            case STAGES.INDEX:
                return MovieIndexService.isReady(
                    await GetFileName.getFileName(jobId)
                );
            case STAGES.RECAP:
                return RecapService.hasRecap(jobId);
            case STAGES.TTS:
                return VoiceoverService.isDone(jobId);
            case STAGES.CUT:
                return CutService.isDone(jobId);
            case STAGES.ASSEMBLE:
                return AssembleService.isDone(jobId);
            default:
                return false;
        }
    }

    async resumeJob({ jobId }) {
        const paths = Storage.getPaths(jobId);

        if (!fs.existsSync(paths.root)) {
            throw new Error(
                `Job ${jobId} was not found`
            );
        }

        const progress = await ProgressService.load(jobId);
        let stage = progress.currentStage;

        if (!stage) {
            for (const pipelineStage of PIPELINE_STAGES) {
                const status = progress.stages?.[pipelineStage]?.status;

                if (status !== "completed" || !(await this.artifactReady(jobId, pipelineStage))) {
                    stage = pipelineStage;
                    break;
                }
            }
        }

        if (!stage) {
            return {
                jobId,
                resumedFrom: null,
                message: "All stages are complete. Open review/index.html to watch the cuts."
            };
        }

        if (progress.stages?.[stage]?.status === "completed" && await this.artifactReady(jobId, stage)) {
            const index = PIPELINE_STAGES.indexOf(stage);
            stage = PIPELINE_STAGES[index + 1] || null;

            if (!stage) {
                return {
                    jobId,
                    resumedFrom: null,
                    message: "All stages are complete. Open review/index.html to watch the cuts."
                };
            }
        }

        const startEvent = STAGE_START_EVENT[stage];

        if (!startEvent) {
            throw new Error(
                `Cannot resume stage: ${stage}`
            );
        }

        console.log(
            `[ResumeJob] Resuming from stage: ${stage}`
        );

        EventBus.publish(startEvent, { jobId });

        return {
            jobId,
            resumedFrom: stage
        };
    }
}

module.exports = new ResumeJobService();
