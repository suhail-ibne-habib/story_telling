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
            STAGES.AUDIO,
            STAGES.VISION_ANALYSIS,
            STAGES.CHUNK_ANALYSIS,
            STAGES.FULL_MOVIE_UNDERSTANDING,
            STAGES.STORY_BEAT_PLANNING,
            STAGES.SHOT_MAPPING,
            STAGES.CLIP_EXTRACTION,
            STAGES.SCRIPT,
            STAGES.VOICE_GENERATION,
            STAGES.VIDEO_ASSEMBLY
        ];

        // 3. Determine stage
        let stage = progress.currentStage;

        /*
         * If there is no currently running stage,
         * find the first stage that is not completed.
         */
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

        // 4. Everything is completed
        if (!stage) {

            throw new Error(
                `Job ${jobId} has already completed all pipeline stages.`
            );
        }

        console.log(
            `[ResumeJob] Resuming from stage: ${stage}`
        );

        /*
         * 5. Trigger the worker responsible for the stage.
         *
         * IMPORTANT:
         *
         * We don't directly call workers here.
         * We publish the event that normally starts
         * that worker.
         */

        switch (stage) {

            case STAGES.AUDIO:
                EventBus.publish(
                    events.METADATA_COMPLETED,
                    { jobId }
                );

                break;

            /*
             * Vision Analysis Worker
             *
             * Trigger:
             * CONTACT_SHEETS_COMPLETED
             */
            case STAGES.VISION_ANALYSIS:

                EventBus.publish(
                    events.CONTACT_SHEETS_COMPLETED,
                    { jobId }
                );

                break;


            /*
             * Chunk Analysis Worker
             *
             * Trigger:
             * VISION_ANALYZE_COMPLETED
             */
            case STAGES.CHUNK_ANALYSIS:

                EventBus.publish(
                    events.VISION_ANALYZE_COMPLETED,
                    { jobId }
                );

                break;


            /*
             * Full Movie Understanding Worker
             *
             * Trigger:
             * CHUNK_ANALYSIS_COMPLETED
             */
            case STAGES.FULL_MOVIE_UNDERSTANDING:

                EventBus.publish(
                    events.CHUNK_ANALYSIS_COMPLETED,
                    { jobId }
                );

                break;


            /*
             * Story Beat Planning Worker
             *
             * Trigger:
             * FULL_MOVIE_UNDERSTANDING_COMPLETED
             */
            case STAGES.STORY_BEAT_PLANNING:

                EventBus.publish(
                    events.FULL_MOVIE_UNDERSTANDING_COMPLETED,
                    { jobId }
                );

                break;


            /*
             * Shot Mapping Worker
             *
             * Trigger:
             * STORY_BEAT_PLANNING_COMPLETED
             */
            case STAGES.SHOT_MAPPING:

                EventBus.publish(
                    events.STORY_BEAT_PLANNING_COMPLETED,
                    { jobId }
                );

                break;


            /*
             * Clip Extraction Worker
             *
             * Trigger:
             * SHOT_MAPPING_COMPLETED
             */
            case STAGES.CLIP_EXTRACTION:

                EventBus.publish(
                    events.SHOT_MAPPING_COMPLETED,
                    { jobId }
                );

                break;


            case STAGES.SCRIPT:
                EventBus.publish(
                    events.CLIP_EXTRACTION_COMPLETED,
                    { jobId }
                )

                break;

            case STAGES.VOICE_GENERATION:
                EventBus.publish(
                    events.SCRIPT_GENERATION_COMPLETED,
                    { jobId }
                )

                break;

            case STAGES.VIDEO_RENDER:
                EventBus.publish(
                    events.VOICE_GENERATION_COMPLETED,
                    { jobId }
                )

                break;

            case STAGES.VIDEO_ASSEMBLY:
                EventBus.publish(
                    events.SCRIPT_GENERATION_COMPLETED,
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