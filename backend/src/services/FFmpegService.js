const { execFile } = require("child_process");
const util = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = util.promisify(execFile);

function toConcatLine(filePath) {
    const normalized = path
        .resolve(filePath)
        .replace(/\\/g, "/");

    return `file '${normalized.replace(/'/g, "'\\''")}'`;
}

class FFmpegService {

    constructor() {
        this.binary = "ffmpeg";
    }

    async downsampleTo480p({
        inputPath,
        outputPath,
        hasAudio
    }) {
        const args = [
            "-y",
            "-i",
            inputPath,
            "-vf",
            "scale=-2:'min(480,ih)'",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-movflags",
            "+faststart"
        ];

        if (hasAudio) {
            args.push(
                "-c:a",
                "aac",
                "-b:a",
                "64k",
                "-ac",
                "1"
            );
        } else {
            args.push("-an");
        }

        args.push(outputPath);

        await execFileAsync(
            this.binary,
            args,
            {
                maxBuffer: 10 * 1024 * 1024
            }
        );
    }

    async cropClip({
        inputPath,
        outputPath,
        startMs,
        endMs
    }) {
        if (endMs <= startMs) {
            throw new Error(
                `Invalid clip range: ${startMs}ms → ${endMs}ms`
            );
        }

        const start = (startMs / 1000).toFixed(3);
        const duration = ((endMs - startMs) / 1000).toFixed(3);

        await execFileAsync(
            this.binary,
            [
                "-y",
                "-ss",
                start,
                "-i",
                inputPath,
                "-t",
                duration,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                outputPath
            ],
            {
                maxBuffer: 10 * 1024 * 1024
            }
        );
    }

    async extractFrame({
        inputPath,
        outputPath,
        timeSec
    }) {
        await execFileAsync(
            this.binary,
            [
                "-y",
                "-ss",
                Math.max(0, Number(timeSec) || 0).toFixed(3),
                "-i",
                inputPath,
                "-frames:v",
                "1",
                "-q:v",
                "3",
                outputPath
            ],
            {
                maxBuffer: 10 * 1024 * 1024
            }
        );
    }

    async concatenate({
        concatListPath,
        outputPath
    }) {
        await execFileAsync(
            this.binary,
            [
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concatListPath,
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                outputPath
            ],
            {
                maxBuffer: 10 * 1024 * 1024
            }
        );
    }

    async concatenateReencode({
        concatListPath,
        outputPath
    }) {
        await execFileAsync(
            this.binary,
            [
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concatListPath,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-an",
                "-movflags",
                "+faststart",
                outputPath
            ],
            {
                maxBuffer: 10 * 1024 * 1024
            }
        );
    }

    async concatenateAv({
        concatListPath,
        outputPath
    }) {
        await execFileAsync(
            this.binary,
            [
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concatListPath,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                outputPath
            ],
            {
                maxBuffer: 10 * 1024 * 1024
            }
        );
    }

    async concatenateFiles({
        inputPaths,
        outputPath,
        withAudio = false
    }) {
        if (!Array.isArray(inputPaths) || inputPaths.length === 0) {
            throw new Error("No files to concatenate.");
        }

        if (inputPaths.length === 1) {
            await fs.promises.copyFile(inputPaths[0], outputPath);
            return;
        }

        const concatListPath = path.join(
            path.dirname(outputPath),
            `${path.basename(outputPath, path.extname(outputPath))}_concat.txt`
        );

        await fs.promises.writeFile(
            concatListPath,
            inputPaths.map(toConcatLine).join("\n") + "\n",
            "utf-8"
        );

        if (withAudio) {
            await this.concatenateAv({
                concatListPath,
                outputPath
            });
            return;
        }

        await this.concatenateReencode({
            concatListPath,
            outputPath
        });
    }

    async speedVideo({
        inputPath,
        outputPath,
        speed
    }) {
        const safeSpeed = Math.min(1.5, Math.max(1, speed || 1));

        await execFileAsync(
            this.binary,
            [
                "-y",
                "-i",
                inputPath,
                "-filter:v",
                `setpts=PTS/${safeSpeed.toFixed(3)}`,
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                outputPath
            ],
            {
                maxBuffer: 10 * 1024 * 1024
            }
        );
    }

    async mixVoiceLocked({
        videoPath,
        voicePath,
        outputPath,
        durationSec
    }) {
        await execFileAsync(
            this.binary,
            [
                "-y",
                "-i",
                videoPath,
                "-i",
                voicePath,
                "-filter_complex",
                "[0:v]tpad=stop_mode=clone:stop=-1[v]",
                "-map",
                "[v]",
                "-map",
                "1:a:0",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-t",
                Number(durationSec).toFixed(3),
                "-movflags",
                "+faststart",
                outputPath
            ],
            {
                maxBuffer: 10 * 1024 * 1024
            }
        );
    }

}

module.exports = new FFmpegService();
