const EventBus = require("../core/EventBus");
const events = require("../events/events");

const Storage = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const ShotMapperService = require("../services/ShotMapperService");

const STAGES = require("../constance/pipelineStages");

const fs = require("fs");
const path = require("path");


EventBus.subscribe(
    events.STORY_BEAT_PLANNING_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========================================"
            );

            console.log(
                "SHOT MAPPING WORKER STARTED"
            );

            console.log(
                `Job ID: ${jobId}`
            );

            console.log(
                "========================================\n"
            );


            /*
             * Start Stage
             */

            await ProgressService.startStage(
                jobId,
                STAGES.SHOT_MAPPING
            );

            console.log(
                "[ShotMapping] Stage started."
            );


            /*
             * Get Storage Paths
             */

            const paths =
                Storage.getPaths(jobId);

            console.log(
                "[ShotMapping] Storage paths loaded."
            );


            /*
             * Story Beats
             */

            const storyBeatsPath =
                path.join(
                    paths.metadata,
                    "story_beats.json"
                );


            console.log(
                "[ShotMapping] Looking for story beats:"
            );

            console.log(
                storyBeatsPath
            );


            /*
             * Check Story Beats
             */

            if (
                !fs.existsSync(storyBeatsPath)
            ) {

                throw new Error(
                    "story_beats.json was not found."
                );

            }


            /*
             * Read Story Beats
             */

            console.log(
                "[ShotMapping] Loading story beats..."
            );


            const storyBeatsRaw =
                await fs.promises.readFile(
                    storyBeatsPath,
                    "utf-8"
                );


            const storyBeats =
                JSON.parse(storyBeatsRaw);


            if (
                !Array.isArray(storyBeats.beats)
            ) {

                throw new Error(
                    "story_beats.json does not contain a valid beats array."
                );

            }


            console.log(
                "[ShotMapping] Story beats loaded."
            );


            console.log({
                targetDuration:
                    storyBeats.targetDuration,

                beatCount:
                    storyBeats.beats.length
            });


            /*
             * Check Existing Clip Plan
             *
             * Resume protection.
             */

            const outputPath =
                path.join(
                    paths.metadata,
                    "clip_plan.json"
                );


            if (
                fs.existsSync(outputPath)
            ) {

                console.log(
                    "[ShotMapping] clip_plan.json already exists."
                );

                console.log(
                    "[ShotMapping] Skipping shot mapping."
                );


                await ProgressService.completeStage(
                    jobId,
                    STAGES.SHOT_MAPPING
                );


                EventBus.publish(
                    events.CLIP_PLANNING_COMPLETED,
                    { jobId }
                );


                return;

            }


            /*
             * Validate Chunks Directory
             */

            if (
                !fs.existsSync(paths.chunks)
            ) {

                throw new Error(
                    "Chunks directory was not found."
                );

            }


            console.log(
                "[ShotMapping] Loading original chunks..."
            );


            const chunkFiles =
                await fs.promises.readdir(
                    paths.chunks
                );


            const jsonChunkFiles =
                chunkFiles
                    .filter(
                        file =>
                            file.endsWith(".json")
                    )
                    .sort();


            if (
                !jsonChunkFiles.length
            ) {

                throw new Error(
                    "No chunk files were found."
                );

            }


            console.log(
                `[ShotMapping] Found ${jsonChunkFiles.length} chunk files.`
            );


            /*
             * Load Chunks
             */

            const chunks = [];


            for (
                const file of jsonChunkFiles
            ) {

                const chunkPath =
                    path.join(
                        paths.chunks,
                        file
                    );


                const raw =
                    await fs.promises.readFile(
                        chunkPath,
                        "utf-8"
                    );


                const chunk =
                    JSON.parse(raw);


                chunks.push(chunk);

            }


            console.log(
                `[ShotMapping] Loaded ${chunks.length} chunks.`
            );


            /*
             * Basic Validation
             */

            for (
                const beat of storyBeats.beats
            ) {

                if (
                    !beat.chunkId
                ) {

                    console.warn(
                        `[ShotMapping] Beat ${beat.id} has no chunkId.`
                    );

                }

            }


            /*
             * Run Shot Mapper
             */

            console.log(
                "\n[ShotMapping] Mapping story beats to real shots..."
            );


            console.log(
                "[ShotMapping] No DeepSeek call is required here."
            );


            const clipPlan =
                await ShotMapperService.map(
                    jobId
                );


            /*
             * Validate Result
             */

            if (
                !clipPlan ||
                !Array.isArray(clipPlan.clips)
            ) {

                throw new Error(
                    "ShotMapperService returned an invalid clip plan."
                );

            }


            console.log(
                "\n[ShotMapping] Shot mapping completed."
            );


            console.log({
                targetDuration:
                    clipPlan.targetDuration,

                actualDuration:
                    clipPlan.actualDuration,

                clipCount:
                    clipPlan.clips.length
            });


            /*
             * Make Sure Output Exists
             */

            if (
                !fs.existsSync(outputPath)
            ) {

                throw new Error(
                    "ShotMapperService did not create clip_plan.json."
                );

            }


            console.log(
                `[ShotMapping] Clip plan saved: ${outputPath}`
            );


            /*
             * Complete Stage
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.SHOT_MAPPING
            );


            console.log(
                "\n========================================"
            );

            console.log(
                "SHOT MAPPING COMPLETED"
            );

            console.log(
                "========================================\n"
            );


            /*
             * Continue Pipeline
             */

            EventBus.publish(
                events.CLIP_PLANNING_COMPLETED,
                {
                    jobId
                }
            );


        } catch (error) {

            console.error(
                "\n========================================"
            );

            console.error(
                "SHOT MAPPING WORKER FAILED"
            );

            console.error(
                `Job ID: ${jobId}`
            );

            console.error(
                error
            );

            console.error(
                "========================================\n"
            );


            await ProgressService.failStage(
                jobId,
                STAGES.SHOT_MAPPING,
                error.message
            );


            EventBus.publish(
                events.SHOT_MAPPING_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );

        }

    }
);