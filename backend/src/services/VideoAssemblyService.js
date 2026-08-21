const {
    spawn
} = require("child_process");

const fs =
    require("fs");

const path =
    require("path");


class VideoAssemblyService {


    /*
     * -----------------------------------------
     * Run FFmpeg
     * -----------------------------------------
     */

    runFFmpeg(args) {

        return new Promise(
            (resolve, reject) => {

                console.log(
                    `[VideoAssembly] ffmpeg ${args.join(" ")}`
                );


                const ffmpeg =
                    spawn(
                        "ffmpeg",
                        args
                    );


                let stderr = "";


                ffmpeg.stderr.on(
                    "data",
                    data => {

                        stderr +=
                            data.toString();

                    }
                );


                ffmpeg.on(
                    "error",
                    error => {

                        reject(error);

                    }
                );


                ffmpeg.on(
                    "close",
                    code => {

                        if (code === 0) {

                            resolve();

                            return;

                        }


                        reject(
                            new Error(
                                `FFmpeg failed with code ${code}\n${stderr}`
                            )
                        );

                    }
                );

            }
        );

    }


    /*
     * -----------------------------------------
     * Create one beat video
     * -----------------------------------------
     *
     * Video + narration audio
     *
     * The video is trimmed to the audio duration.
     *
     * V1 intentionally keeps this simple.
     * -----------------------------------------
     */

    async createBeatVideo({

        videoPath,

        audioPath,

        outputPath

    }) {


        if (!videoPath) {

            throw new Error(
                "Video path is required."
            );

        }


        if (!audioPath) {

            throw new Error(
                "Audio path is required."
            );

        }


        if (!outputPath) {

            throw new Error(
                "Output path is required."
            );

        }


        if (
            !fs.existsSync(videoPath)
        ) {

            throw new Error(
                `Video file does not exist: ${videoPath}`
            );

        }


        if (
            !fs.existsSync(audioPath)
        ) {

            throw new Error(
                `Audio file does not exist: ${audioPath}`
            );

        }


        await fs.promises.mkdir(

            path.dirname(outputPath),

            {
                recursive: true
            }

        );


        /*
         * -----------------------------------------
         * Combine video + narration
         * -----------------------------------------
         *
         * -shortest prevents trailing silence/video.
         *
         * Video is copied when possible.
         * Audio is encoded to AAC for MP4 compatibility.
         * -----------------------------------------
         */

        const args = [

            "-y",

            "-i",
            videoPath,

            "-i",
            audioPath,

            "-map",
            "0:v:0",

            "-map",
            "1:a:0",

            "-c:v",
            "libx264",

            "-preset",
            "fast",

            "-crf",
            "18",

            "-c:a",
            "aac",

            "-b:a",
            "192k",

            "-shortest",

            "-movflags",
            "+faststart",

            outputPath

        ];


        await this.runFFmpeg(
            args
        );


        return outputPath;

    }


    /*
     * -----------------------------------------
     * Create concat file
     * -----------------------------------------
     */

    async createConcatFile({

        beatVideos,

        concatPath

    }) {


        if (
            !Array.isArray(beatVideos) ||
            !beatVideos.length
        ) {

            throw new Error(
                "No beat videos provided for concatenation."
            );

        }


        const lines =
            beatVideos.map(
                videoPath => {

                    /*
                     * FFmpeg concat files use
                     * single-quoted paths.
                     *
                     * Escape single quotes.
                     */

                    const safePath =
                        videoPath
                            .replace(
                                /'/g,
                                "'\\''"
                            );

                    return `file '${safePath}'`;

                }
            );


        await fs.promises.writeFile(

            concatPath,

            lines.join("\n"),

            "utf8"

        );


        return concatPath;

    }


    /*
     * -----------------------------------------
     * Concatenate beat videos
     * -----------------------------------------
     */

    async concatenate({

        beatVideos,

        outputPath,

        workingDirectory

    }) {


        if (
            !Array.isArray(beatVideos) ||
            !beatVideos.length
        ) {

            throw new Error(
                "No beat videos provided."
            );

        }


        if (!outputPath) {

            throw new Error(
                "Final output path is required."
            );

        }


        const directory =
            workingDirectory ||
            path.dirname(outputPath);


        await fs.promises.mkdir(

            directory,

            {
                recursive: true
            }

        );


        const concatPath =
            path.join(
                directory,
                "concat.txt"
            );


        /*
         * -----------------------------------------
         * Build concat file
         * -----------------------------------------
         */

        await this.createConcatFile({

            beatVideos,

            concatPath

        });


        /*
         * -----------------------------------------
         * Concatenate
         * -----------------------------------------
         *
         * We re-encode the final output so the
         * resulting file is stable even if there
         * are minor differences between beat clips.
         * -----------------------------------------
         */

        const args = [

            "-y",

            "-f",
            "concat",

            "-safe",
            "0",

            "-i",
            concatPath,

            "-c:v",
            "libx264",

            "-preset",
            "fast",

            "-crf",
            "18",

            "-c:a",
            "aac",

            "-b:a",
            "192k",

            "-movflags",
            "+faststart",

            outputPath

        ];


        await this.runFFmpeg(
            args
        );


        return outputPath;

    }

}


module.exports =
    new VideoAssemblyService();