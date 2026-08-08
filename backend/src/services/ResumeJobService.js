const Storage = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const EventBus = require("../core/EventBus");

const events = require("../events/events");
const STAGES = require("../constance/pipelineStages");

const fs = require("fs");

class ResumeJobService {

    async resumeJob({ jobId }) {

        // 1. Validate job
        const paths = Storage.getPaths(jobId);

        if (!fs.existsSync(paths.root)) {
            throw new Error(
                `Job ${jobId} was not found`
            );
        }

        // 2. Load progress
        const progress =
            await ProgressService.load(jobId);

        const PIPELINE_STAGES = [
            STAGES.VISION_ANALYSIS,
            STAGES.CHUNK_ANALYSIS,
            STAGES.FULL_MOVIE_UNDERSTANDING,
            STAGES.CLIP_PLANNING,
            STAGES.CLIP_EXTRACTION
            // future stages...
        ];

        // 3. Determine stage
        let stage = progress.currentStage;

        // If there is no currently running stage,
        // find the first stage that isn't completed.
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

        // 4. Everything is already completed
        if (!stage) {
            throw new Error(
                `Job ${jobId} has already completed all pipeline stages.`
            );
        }

        console.log(
            `[ResumeJob] Resuming from stage: ${stage}`
        );

        // 5. Trigger the worker responsible for that stage
        switch (stage) {

            case STAGES.VISION_ANALYSIS:

                EventBus.publish(
                    events.CONTACT_SHEETS_COMPLETED,
                    { jobId }
                );

                break;


            case STAGES.CHUNK_ANALYSIS:

                EventBus.publish(
                    events.VISION_ANALYZE_COMPLETED,
                    { jobId }
                );

                break;


            case STAGES.FULL_MOVIE_UNDERSTANDING:

                EventBus.publish(
                    events.CHUNK_ANALYSIS_COMPLETED,
                    { jobId }
                );

                break;


            case STAGES.CLIP_PLANNING:

                EventBus.publish(
                    events.FULL_MOVIE_UNDERSTANDING_COMPLETED,
                    { jobId }
                );

                break;

            case STAGES.CLIP_EXTRACTION:
                EventBus.publish(
                    events.CLIP_PLANNING_COMPLETED,
                    { jobId }
                )

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