const { spawn } = require("child_process");

class ClipExtractionService {

    async extract({
        inputPath,
        outputPath,
        startTime,
        endTime
    }) {

        if (!inputPath) {
            throw new Error("Input movie path is required.");
        }

        if (!outputPath) {
            throw new Error("Output clip path is required.");
        }

        if (!startTime) {
            throw new Error("Clip startTime is required.");
        }

        if (!endTime) {
            throw new Error("Clip endTime is required.");
        }

        console.log(
            `[ClipExtraction] ${startTime} → ${endTime}`
        );

        return new Promise((resolve, reject) => {

            const args = [
                "-y",

                "-ss",
                this.normalizeTimestamp(startTime),

                "-to",
                this.normalizeTimestamp(endTime),

                "-i",
                inputPath,

                "-map",
                "0:v:0",

                "-map",
                "0:a?",

                "-c:v",
                "libx264",

                "-preset",
                "fast",

                "-crf",
                "18",

                "-c:a",
                "aac",

                "-movflags",
                "+faststart",

                outputPath
            ];


            console.log(
                `[ClipExtraction] ffmpeg ${args.join(" ")}`
            );


            const ffmpeg =
                spawn("ffmpeg", args);


            let stderr = "";


            ffmpeg.stderr.on(
                "data",
                (data) => {

                    stderr +=
                        data.toString();

                }
            );


            ffmpeg.on(
                "error",
                (error) => {

                    reject(error);

                }
            );


            ffmpeg.on(
                "close",
                (code) => {

                    if (code === 0) {

                        console.log(
                            `[ClipExtraction] Completed: ${outputPath}`
                        );

                        resolve(outputPath);

                        return;
                    }


                    reject(
                        new Error(
                            `FFmpeg failed with code ${code}\n${stderr}`
                        )
                    );

                }
            );

        });

    }


    normalizeTimestamp(time) {
        if (!time) {
            throw new Error("Invalid timestamp.");
        }

        return String(time).replace(",", ".");
    }

}

module.exports =
    new ClipExtractionService();