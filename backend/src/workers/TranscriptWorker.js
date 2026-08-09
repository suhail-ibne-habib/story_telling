const path = require("path");
const fs = require("fs");

const EventBus = require("../core/EventBus");
const events = require("../events/events");

const StorageService = require("../../storage/StorageService");
const WhisperService = require("../services/WhisperService");
const ProgressService = require("../services/ProgressService");
const GetFileName = require("../core/GetFileName");

const STAGES = require("../constance/pipelineStages");


EventBus.subscribe(

    events.AUDIO_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== TRANSCRIPT WORKER =========="
            );

            console.log(
                `[Transcript] Job ID: ${jobId}`
            );


            /*
             * 1. Check current progress
             *
             * ProgressService is the source of truth
             * for resume handling.
             */

            const progress =
                await ProgressService.load(jobId);


            const transcriptStage =
                progress?.stages?.[
                STAGES.TRANSCRIPT
                ];


            /*
             * 2. If already completed,
             * don't run Whisper again.
             */

            if (
                transcriptStage?.status === "completed"
            ) {

                console.log(
                    "[Transcript] Stage already completed. Skipping."
                );


                EventBus.publish(

                    events.TRANSCRIPT_COMPLETED,

                    {
                        jobId
                    }

                );

                return;
            }


            /*
             * 4. Get storage paths
             */

            const paths =
                StorageService.getPaths(jobId);


            /*
             * 5. Audio file
             */

            const audioFile =
                path.join(
                    paths.audio,
                    "audio.wav"
                );


            /*
             * 6. Validate required input
             *
             * This is NOT resume logic.
             *
             * We need the audio file because
             * Whisper cannot run without it.
             */

            if (
                !fs.existsSync(audioFile)
            ) {

                throw new Error(
                    `Audio file not found: ${audioFile}`
                );

            }


            /*
             * 7. Transcript output prefix
             */

            const outputPrefix =
                path.join(
                    paths.transcript,
                    "transcript"
                );


            /*
             * 8. Start stage
             */

            await ProgressService.startStage(
                jobId,
                STAGES.TRANSCRIPT
            );


            console.log(
                "[Transcript] Stage started."
            );


            /*
             * 9. Run Whisper
             */

            console.log(
                "[Transcript] Starting Whisper..."
            );


            await WhisperService.transcribe(
                audioFile,
                outputPrefix
            );


            console.log(
                "[Transcript] Whisper completed."
            );


            /*
             * 10. Complete stage
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.TRANSCRIPT
            );


            console.log(
                "[Transcript] Stage completed."
            );


            /*
             * 11. Trigger next stage
             */

            EventBus.publish(

                events.TRANSCRIPT_COMPLETED,

                {
                    jobId
                }

            );


            console.log(
                "====================================\n"
            );


        } catch (error) {

            console.error(
                "[Transcript] Worker failed:",
                error
            );


            /*
             * 12. Mark stage failed
             */

            try {

                await ProgressService.failStage(

                    jobId,

                    STAGES.TRANSCRIPT,

                    error.message

                );

            } catch (progressError) {

                console.error(
                    "[Transcript] Failed to update progress:",
                    progressError
                );

            }


            /*
             * 13. Notify pipeline
             */

            EventBus.publish(

                events.TRANSCRIPT_FAILED,

                {
                    jobId,
                    error: error.message
                }

            );

        }

    }

);