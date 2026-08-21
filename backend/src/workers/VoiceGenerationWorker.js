const EventBus =
    require("../core/EventBus");

const events =
    require("../events/events");

const Storage =
    require("../../storage/StorageService");

const ProgressService =
    require("../services/ProgressService");

const VoiceGenerationService =
    require("../services/VoiceGenerationService");

const STAGES =
    require("../constance/pipelineStages");

const path =
    require("path");

const fs =
    require("fs");


EventBus.subscribe(
    events.SCRIPT_GENERATION_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========================================"
            );

            console.log(
                "Voice Generation Worker is running..."
            );

            console.log(
                "========================================\n"
            );


            /*
             * -----------------------------------------
             * Start stage
             * -----------------------------------------
             */

            await ProgressService.startStage(
                jobId,
                STAGES.VOICE_GENERATION
            );


            /*
             * -----------------------------------------
             * Storage
             * -----------------------------------------
             */

            const paths =
                Storage.getPaths(jobId);


            /*
             * -----------------------------------------
             * Script directory
             * -----------------------------------------
             */

            const scriptDirectory =
                paths.scripts;


            if (!scriptDirectory) {

                throw new Error(
                    "Storage paths.scripts is not configured."
                );

            }


            /*
             * -----------------------------------------
             * Voice output directory
             * -----------------------------------------
             */

            const voiceDirectory =
                paths.voice;


            if (!voiceDirectory) {

                throw new Error(
                    "Storage paths.voice is not configured."
                );

            }


            await fs.promises.mkdir(
                voiceDirectory,
                {
                    recursive: true
                }
            );


            /*
             * -----------------------------------------
             * Find script files
             * -----------------------------------------
             */

            const files =
                await fs.promises.readdir(
                    scriptDirectory
                );


            const scriptFiles =
                files.filter(
                    file =>
                        file.endsWith(".json") &&
                        file !== "script_manifest.json"
                );


            if (!scriptFiles.length) {

                throw new Error(
                    "No script files were found."
                );

            }


            console.log(
                `[VoiceGeneration] Found ${scriptFiles.length} scripts.`
            );


            /*
             * -----------------------------------------
             * Process scripts
             * -----------------------------------------
             */

            const results = [];


            for (
                const file of scriptFiles
            ) {

                const scriptPath =
                    path.join(
                        scriptDirectory,
                        file
                    );


                const raw =
                    await fs.promises.readFile(
                        scriptPath,
                        "utf8"
                    );


                let script =
                    JSON.parse(raw);


                /*
                 * Handle double-encoded JSON.
                 */
                if (typeof script === "string") {

                    script =
                        JSON.parse(script);

                }

                console.log(
                    `[VoiceGeneration] Loaded ${file}:`,
                    JSON.stringify(script, null, 2)
                );

                console.log(
                    `[VoiceGeneration] script.beatId:`,
                    script.beatId
                );

                console.log(
                    `[VoiceGeneration] typeof script.beatId:`,
                    typeof script.beatId
                );

                console.log(
                    `[VoiceGeneration] keys:`,
                    Object.keys(script)
                );


                const beatId =
                    script.beatId;


                if (!beatId) {

                    console.warn(
                        `[VoiceGeneration] ${file} has no beatId. Skipping.`
                    );

                    continue;

                }


                const narration =
                    script.narration;


                if (
                    !narration ||
                    !narration.trim()
                ) {

                    console.warn(
                        `[VoiceGeneration] ${beatId} has no narration. Skipping.`
                    );

                    continue;

                }


                console.log(
                    `\n[VoiceGeneration] Processing ${beatId}`
                );


                console.log({
                    beatId,
                    wordCount:
                        script.wordCount,
                    duration:
                        script.duration
                });


                /*
                 * -------------------------------------
                 * Output audio
                 * -------------------------------------
                 */

                const outputPath =
                    path.join(
                        voiceDirectory,
                        `${beatId}.mp3`
                    );


                /*
                 * -------------------------------------
                 * Generate voice
                 * -------------------------------------
                 */

                await VoiceGenerationService.generate({

                    text:
                        narration,

                    outputPath

                });


                /*
                 * -------------------------------------
                 * Store result
                 * -------------------------------------
                 */

                results.push({

                    beatId,

                    narration,

                    wordCount:
                        script.wordCount ?? null,

                    output:
                        outputPath

                });


                console.log(
                    `[VoiceGeneration] ${beatId} completed.`
                );

            }


            /*
             * -----------------------------------------
             * Save manifest
             * -----------------------------------------
             */

            const manifestPath =
                path.join(
                    voiceDirectory,
                    "voice_manifest.json"
                );


            await fs.promises.writeFile(

                manifestPath,

                JSON.stringify(

                    {
                        jobId,
                        voices:
                            results
                    },

                    null,
                    2

                ),

                "utf8"

            );


            /*
             * -----------------------------------------
             * Complete stage
             * -----------------------------------------
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.VOICE_GENERATION
            );


            console.log(
                "\n========================================"
            );

            console.log(
                "Voice Generation Completed"
            );

            console.log(
                "========================================\n"
            );


            /*
             * -----------------------------------------
             * Trigger next stage
             * -----------------------------------------
             */

            EventBus.publish(

                events.VOICE_GENERATION_COMPLETED,

                {
                    jobId
                }

            );


        } catch (error) {

            console.error(
                "\n========================================"
            );

            console.error(
                "VOICE GENERATION WORKER FAILED"
            );

            console.error(
                "Job ID:",
                jobId
            );

            console.error(
                "Error:",
                error.message
            );

            console.error(
                error.stack
            );

            console.error(
                "========================================\n"
            );


            await ProgressService.failStage(

                jobId,

                STAGES.VOICE_GENERATION,

                error.message

            );


            EventBus.publish(

                events.VOICE_GENERATION_FAILED,

                {
                    jobId,

                    error:
                        error.message
                }

            );

        }

    }
);