const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

class ClipExtractionService {

    async extract({
        inputPath,
        outputPath,
        start,
        end
    }) {

        // -----------------------------------------
        // Validate input
        // -----------------------------------------

        if (!inputPath) {
            throw new Error(
                "Clip extraction inputPath is required."
            );
        }

        if (!outputPath) {
            throw new Error(
                "Clip extraction outputPath is required."
            );
        }

        if (
            typeof start !== "number" ||
            typeof end !== "number"
        ) {
            throw new Error(
                `Invalid clip timestamps: ${start} -> ${end}`
            );
        }

        const duration = end - start;

        if (start < 0) {
            throw new Error(
                `Invalid clip start time: ${start}`
            );
        }

        if (duration <= 0) {
            throw new Error(
                `Invalid clip duration: ${start} -> ${end}`
            );
        }

        // -----------------------------------------
        // Validate source movie
        // -----------------------------------------

        try {

            await fs.promises.access(
                inputPath,
                fs.constants.F_OK
            );

        } catch {

            throw new Error(
                `Source movie was not found: ${inputPath}`
            );

        }

        // -----------------------------------------
        // Ensure output directory exists
        // -----------------------------------------

        await fs.promises.mkdir(
            path.dirname(outputPath),
            {
                recursive: true
            }
        );

        console.log(
            `[ClipExtraction] Extracting ${start}s -> ${end}s`
        );

        console.log(
            `[ClipExtraction] Duration: ${duration}s`
        );

        console.log(
            `[ClipExtraction] Output: ${outputPath}`
        );

        // -----------------------------------------
        // Run FFmpeg
        // -----------------------------------------

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
                        "\n========== FFMPEG STARTED =========="
                    );

                    console.log(command);

                    console.log(
                        "====================================\n"
                    );

                })

                .on("progress", progress => {

                    if (progress.percent !== undefined) {

                        console.log(
                            `[FFmpeg] ${progress.percent.toFixed(2)}%`
                        );

                    }

                })

                .on("end", async () => {

                    try {

                        // -----------------------------------------
                        // Verify output actually exists
                        // -----------------------------------------

                        await fs.promises.access(
                            outputPath,
                            fs.constants.F_OK
                        );

                        const stats =
                            await fs.promises.stat(
                                outputPath
                            );

                        if (stats.size === 0) {

                            throw new Error(
                                `FFmpeg created an empty file: ${outputPath}`
                            );

                        }

                        console.log(
                            `[ClipExtraction] Completed: ${outputPath}`
                        );

                        resolve();

                    } catch (error) {

                        reject(error);

                    }

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