const EventBus =
    require("../core/EventBus");

const events =
    require("../events/events");

const Storage =
    require("../../storage/StorageService");

const ProgressService =
    require("../services/ProgressService");

const VideoAssemblyService =
    require("../services/VideoAssemblyService");

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
                "Video Assembly Worker is running..."
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
                STAGES.VIDEO_ASSEMBLY
            );


            /*
             * -----------------------------------------
             * Storage
             * -----------------------------------------
             */

            const paths =
                Storage.getPaths(jobId);


            const clipsDirectory =
                paths.clips;


            const voiceDirectory =
                paths.voice;


            if (!clipsDirectory) {

                throw new Error(
                    "Storage paths.clips is not configured."
                );

            }


            if (!voiceDirectory) {

                throw new Error(
                    "Storage paths.voice is not configured."
                );

            }


            /*
             * -----------------------------------------
             * Output directory
             * -----------------------------------------
             */

            const outputDirectory =
                paths.output ||
                path.join(
                    paths.root,
                    "output"
                );


            await fs.promises.mkdir(

                outputDirectory,

                {
                    recursive: true
                }

            );


            /*
             * -----------------------------------------
             * Beat video working directory
             * -----------------------------------------
             */

            const beatVideoDirectory =
                path.join(
                    outputDirectory,
                    "beats"
                );


            await fs.promises.mkdir(

                beatVideoDirectory,

                {
                    recursive: true
                }

            );


            /*
             * -----------------------------------------
             * Read clip manifest
             * -----------------------------------------
             */

            const clipManifestPath =
                path.join(
                    clipsDirectory,
                    "clip_manifest.json"
                );


            if (
                !fs.existsSync(
                    clipManifestPath
                )
            ) {

                throw new Error(
                    `Clip manifest not found: ${clipManifestPath}`
                );

            }


            const clipManifestRaw =
                await fs.promises.readFile(

                    clipManifestPath,

                    "utf8"

                );


            const clipManifest =
                JSON.parse(
                    clipManifestRaw
                );


            const clips =
                clipManifest.clips || [];


            if (!clips.length) {

                throw new Error(
                    "No clips were found in clip_manifest.json."
                );

            }


            console.log(
                `[VideoAssembly] Found ${clips.length} clips.`
            );


            /*
             * -----------------------------------------
             * Read voice manifest
             * -----------------------------------------
             */

            const voiceManifestPath =
                path.join(
                    voiceDirectory,
                    "voice_manifest.json"
                );


            if (
                !fs.existsSync(
                    voiceManifestPath
                )
            ) {

                throw new Error(
                    `Voice manifest not found: ${voiceManifestPath}`
                );

            }


            const voiceManifestRaw =
                await fs.promises.readFile(

                    voiceManifestPath,

                    "utf8"

                );


            const voiceManifest =
                JSON.parse(
                    voiceManifestRaw
                );


            const voices =
                voiceManifest.voices || [];


            if (!voices.length) {

                throw new Error(
                    "No voices were found in voice_manifest.json."
                );

            }


            console.log(
                `[VideoAssembly] Found ${voices.length} voice files.`
            );


            /*
             * -----------------------------------------
             * Create lookup map for voices
             * -----------------------------------------
             */

            const voiceMap =
                new Map();


            for (
                const voice of voices
            ) {

                if (
                    !voice.beatId
                ) {

                    continue;

                }


                /*
                 * Prefer the manifest output path.
                 *
                 * But if it doesn't exist,
                 * fall back to the voice directory.
                 */

                let voicePath =
                    voice.output;


                if (
                    !voicePath ||
                    !fs.existsSync(voicePath)
                ) {

                    voicePath =
                        path.join(
                            voiceDirectory,
                            `${voice.beatId}.mp3`
                        );

                }


                voiceMap.set(

                    voice.beatId,

                    {
                        ...voice,
                        path: voicePath
                    }

                );

            }


            /*
             * -----------------------------------------
             * Sort clips by beat order
             *
             * BEAT_001
             * BEAT_002
             * ...
             * -----------------------------------------
             */

            const sortedClips =
                [...clips].sort(

                    (a, b) => {

                        const aNumber =
                            parseInt(
                                String(a.beatId)
                                    .replace(
                                        /\D/g,
                                        ""
                                    ),
                                10
                            );


                        const bNumber =
                            parseInt(
                                String(b.beatId)
                                    .replace(
                                        /\D/g,
                                        ""
                                    ),
                                10
                            );


                        return (
                            aNumber -
                            bNumber
                        );

                    }

                );


            /*
             * -----------------------------------------
             * Process each beat
             * -----------------------------------------
             */

            const beatVideos = [];

            const assemblyResults = [];


            for (
                const clip of sortedClips
            ) {

                const beatId =
                    clip.beatId;


                if (!beatId) {

                    console.warn(
                        "[VideoAssembly] Clip has no beatId. Skipping."
                    );

                    continue;

                }


                console.log(
                    `\n[VideoAssembly] Processing ${beatId}`
                );


                /*
                 * -------------------------------------
                 * Locate video
                 * -------------------------------------
                 */

                let videoPath =
                    clip.output;


                if (
                    !videoPath ||
                    !fs.existsSync(videoPath)
                ) {

                    videoPath =
                        path.join(
                            clipsDirectory,
                            `${beatId}.mp4`
                        );

                }


                if (
                    !fs.existsSync(videoPath)
                ) {

                    console.warn(
                        `[VideoAssembly] Video not found for ${beatId}. Skipping.`
                    );

                    continue;

                }


                /*
                 * -------------------------------------
                 * Locate voice
                 * -------------------------------------
                 */

                const voice =
                    voiceMap.get(
                        beatId
                    );


                if (!voice) {

                    console.warn(
                        `[VideoAssembly] Voice not found for ${beatId}. Skipping.`
                    );

                    continue;

                }


                const audioPath =
                    voice.path;


                if (
                    !audioPath ||
                    !fs.existsSync(audioPath)
                ) {

                    console.warn(
                        `[VideoAssembly] Audio file not found for ${beatId}. Skipping.`
                    );

                    continue;

                }


                console.log({

                    beatId,

                    videoPath,

                    audioPath

                });


                /*
                 * -------------------------------------
                 * Beat-level output
                 * -------------------------------------
                 */

                const beatOutputPath =
                    path.join(

                        beatVideoDirectory,

                        `${beatId}.mp4`

                    );


                /*
                 * -------------------------------------
                 * Combine video + voice
                 * -------------------------------------
                 */

                await VideoAssemblyService.createBeatVideo({

                    videoPath,

                    audioPath,

                    outputPath:
                        beatOutputPath

                });


                /*
                 * -------------------------------------
                 * Add to final concat list
                 * -------------------------------------
                 */

                beatVideos.push(
                    beatOutputPath
                );


                assemblyResults.push({

                    beatId,

                    sourceVideo:
                        videoPath,

                    sourceVoice:
                        audioPath,

                    output:
                        beatOutputPath

                });


                console.log(
                    `[VideoAssembly] ${beatId} completed.`
                );

            }


            /*
             * -----------------------------------------
             * Make sure we actually created something
             * -----------------------------------------
             */

            if (!beatVideos.length) {

                throw new Error(
                    "No beat videos were created."
                );

            }


            /*
             * -----------------------------------------
             * Final output
             * -----------------------------------------
             */

            const finalOutputPath =
                path.join(

                    outputDirectory,

                    "final_recap.mp4"

                );


            console.log(
                "\n[VideoAssembly] Concatenating beat videos..."
            );


            await VideoAssemblyService.concatenate({

                beatVideos,

                outputPath:
                    finalOutputPath,

                workingDirectory:
                    outputDirectory

            });


            /*
             * -----------------------------------------
             * Save assembly manifest
             * -----------------------------------------
             */

            const manifestPath =
                path.join(

                    outputDirectory,

                    "assembly_manifest.json"

                );


            await fs.promises.writeFile(

                manifestPath,

                JSON.stringify(

                    {

                        jobId,

                        beatCount:
                            assemblyResults.length,

                        beats:
                            assemblyResults,

                        output:
                            finalOutputPath

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

                STAGES.VIDEO_ASSEMBLY

            );


            console.log(
                "\n========================================"
            );

            console.log(
                "Video Assembly Completed"
            );

            console.log(
                `Final video: ${finalOutputPath}`
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

                events.VIDEO_ASSEMBLY_COMPLETED,

                {
                    jobId,

                    output:
                        finalOutputPath

                }

            );


        } catch (error) {

            console.error(
                "\n========================================"
            );

            console.error(
                "VIDEO ASSEMBLY WORKER FAILED"
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

                STAGES.VIDEO_ASSEMBLY,

                error.message

            );


            EventBus.publish(

                events.VIDEO_ASSEMBLY_FAILED,

                {

                    jobId,

                    error:
                        error.message

                }

            );

        }

    }

);