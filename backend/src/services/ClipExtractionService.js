const ffmpeg = require("fluent-ffmpeg");

class ClipExtractionService {

    async extract({
        inputPath,
        outputPath,
        start,
        end
    }) {

        const duration = end - start;

        if (duration <= 0) {
            throw new Error(
                `Invalid clip duration: ${start} -> ${end}`
            );
        }

        console.log(
            `[ClipExtraction] Extracting ${start}s -> ${end}s`
        );

        return new Promise((resolve, reject) => {

            ffmpeg(inputPath)
                .setStartTime(start)
                .duration(duration)
                .outputOptions([
                    "-c:v libx264",
                    "-c:a aac",
                    "-movflags +faststart"
                ])
                .output(outputPath)
                .on("start", command => {

                    console.log(
                        "[FFmpeg] Started:",
                        command
                    );

                })
                .on("end", () => {

                    console.log(
                        `[ClipExtraction] Completed: ${outputPath}`
                    );

                    resolve();

                })
                .on("error", error => {

                    console.error(
                        "[FFmpeg] Extraction failed:",
                        error
                    );

                    reject(error);

                })
                .run();
        });
    }
}

module.exports =
    new ClipExtractionService();