const Storage = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const EventBus = require("../core/EventBus");

const events = require("../events/events");
const STAGES = require("../constance/pipelineStages");

const fs = require("fs");
const path = require("path");

class ResumeJobService {

    async resumeJob({ jobId }) {

        const paths = Storage.getPaths(jobId);

        if (!fs.existsSync(paths.root)) {
            throw new Error(
                `Job ${jobId} was not found`
            );
        }

        const progress =
            await ProgressService.load(jobId);

        const PIPELINE_STAGES = [
            STAGES.METADATA,
            STAGES.DOWNSAMPLE,
            STAGES.EVENT_EXTRACTION,
            STAGES.SHOT_DETECTION,
            STAGES.SHOT_SELECTION,
            STAGES.VOICEOVER
        ];

        let stage = progress.currentStage;

        if (!stage) {

            for (const pipelineStage of PIPELINE_STAGES) {

                const status =
                    progress.stages?.[pipelineStage]?.status;

                if (status !== "completed") {
                    stage = pipelineStage;
                    break;
                }
            }
        }

        if (!stage) {
            stage = STAGES.SHOT_SELECTION;
        }

        if (
            stage === STAGES.DOWNSAMPLE &&
            !fs.existsSync(Storage.getProxyMovie(jobId))
        ) {
            stage = STAGES.DOWNSAMPLE;
        }

        if (
            stage === STAGES.EVENT_EXTRACTION &&
            !fs.existsSync(path.join(paths.events, "events.json"))
        ) {
            stage = STAGES.EVENT_EXTRACTION;
        }

        if (
            stage === STAGES.VOICEOVER &&
            !fs.existsSync(path.join(paths.output, "recap_voiced.mp4"))
        ) {
            stage = STAGES.VOICEOVER;
        }

        console.log(
            `[ResumeJob] Resuming from stage: ${stage}`
        );

        switch (stage) {

            case STAGES.METADATA:
                EventBus.publish(
                    events.MOVIE_REGISTERED,
                    { jobId }
                );
                break;

            case STAGES.DOWNSAMPLE:
                EventBus.publish(
                    events.METADATA_COMPLETED,
                    { jobId }
                );
                break;

            case STAGES.EVENT_EXTRACTION:
                EventBus.publish(
                    events.DOWNSAMPLE_COMPLETED,
                    { jobId }
                );
                break;

            case STAGES.SHOT_DETECTION:
                EventBus.publish(
                    events.EVENT_EXTRACTION_COMPLETED,
                    { jobId }
                );
                break;

            case STAGES.SHOT_SELECTION:
                EventBus.publish(
                    events.SHOT_DETECTION_COMPLETED,
                    { jobId }
                );
                break;

            case STAGES.VOICEOVER:
                EventBus.publish(
                    events.SHOT_SELECTION_COMPLETED,
                    { jobId }
                );
                break;

            default:
                throw new Error(
                    `Cannot resume stage: ${stage}`
                );
        }

        return {
            jobId,
            resumedFrom: stage
        };
    }
}

module.exports = new ResumeJobService();
