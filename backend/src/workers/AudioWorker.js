const StorageService =
    require("../../storage/StorageService");

const EventBus =
    require("../core/EventBus");

const events =
    require("../events/events");

const FFmpegService =
    require("../services/FFmpegService");

const FileNameService =
    require("../core/GetFileName");

const ProgressService =
    require("../services/ProgressService");

const STAGES =
    require("../constance/pipelineStages");

const path =
    require("path");

const fs =
    require("fs");


EventBus.subscribe(

    events.METADATA_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== AUDIO WORKER STARTED =========="
            );

            console.log(
                `[Audio] Job ID: ${jobId}`
            );


            /*
             * 1. Get filename
             *
             * FileNameService first checks JobService.
             * If unavailable, it falls back to
             * ProgressService.
             */

            const filename =
                await FileNameService.getFileName(
                    jobId
                );


            console.log(
                `[Audio] Movie filename: ${filename}`
            );


            /*
             * 2. Get storage paths
             */

            const paths =
                StorageService.getPaths(
                    jobId
                );


            /*
             * 3. Ensure audio directory exists
             */

            await fs.promises.mkdir(
                paths.audio,
                {
                    recursive: true
                }
            );


            /*
             * 4. Resolve input movie
             */

            const inputMovieLocation =
                StorageService.getInputMovie(
                    filename
                );


            /*
             * 5. Verify input movie
             */

            if (
                !fs.existsSync(
                    inputMovieLocation
                )
            ) {

                throw new Error(
                    `Input movie not found: ${inputMovieLocation}`
                );

            }


            /*
             * 6. Output audio
             */

            const outputAudio =
                path.join(
                    paths.audio,
                    "audio.wav"
                );


            /*
             * 7. Check progress
             *
             * Resume is controlled by ProgressService.
             */

            const progress =
                await ProgressService.load(
                    jobId
                );


            const audioStage =
                progress?.stages?.[
                STAGES.AUDIO
                ];


            if (
                audioStage?.status === "completed"
            ) {

                console.log(
                    "[Audio] Stage already completed. Skipping."
                );


                EventBus.publish(

                    events.AUDIO_COMPLETED,

                    {
                        jobId
                    }

                );

                return;
            }


            /*
             * 8. Start stage
             */

            await ProgressService.startStage(
                jobId,
                STAGES.AUDIO
            );


            console.log(
                "[Audio] Stage started."
            );


            /*
             * 9. Extract audio
             */

            console.log(
                "[Audio] Extracting audio..."
            );


            await FFmpegService.extractAudio(

                inputMovieLocation,

                outputAudio

            );


            /*
             * 10. Verify output
             */

            if (
                !fs.existsSync(
                    outputAudio
                )
            ) {

                throw new Error(
                    `Audio extraction completed but output file was not found: ${outputAudio}`
                );

            }


            console.log(
                `[Audio] Audio saved: ${outputAudio}`
            );


            /*
             * 11. Complete stage
             */

            await ProgressService.completeStage(

                jobId,

                STAGES.AUDIO

            );


            console.log(
                "[Audio] Stage completed."
            );


            /*
             * 12. Trigger next stage
             */

            EventBus.publish(

                events.AUDIO_COMPLETED,

                {
                    jobId
                }

            );


            console.log(
                "=================================\n"
            );


        } catch (error) {

            console.error(
                "[Audio] Worker failed:",
                error
            );


            /*
             * Mark stage failed
             */

            try {

                await ProgressService.failStage(

                    jobId,

                    STAGES.AUDIO,

                    error.message

                );

            } catch (progressError) {

                console.error(
                    "[Audio] Failed to update progress:",
                    progressError
                );

            }


            /*
             * Notify pipeline
             */

            EventBus.publish(

                events.AUDIO_FAILED,

                {
                    jobId,
                    error: error.message
                }

            );

        }

    }

);