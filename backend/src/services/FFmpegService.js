const { execFile } = require("child_process");
const util = require("util");

const execFileAsync = util.promisify(execFile);

class FFmpegService {

    constructor() {
        this.binary = "ffmpeg";
    }

    async run(args) {
        try {
            await execFileAsync(this.binary, ["-y", "-v", "error", ...args], {
                maxBuffer: 10 * 1024 * 1024
            });
        } catch (error) {
            throw new Error(`ffmpeg failed: ${(error.stderr || error.message).trim().slice(-800)}`);
        }
    }

    async extractFrame({ inputPath, atSec, outputPath, width = 512 }) {
        await this.run([
            "-ss", Math.max(0, atSec).toFixed(3),
            "-i", inputPath,
            "-frames:v", "1",
            "-vf", `scale=${width}:-2`,
            "-q:v", "3",
            outputPath
        ]);
    }

    async extractAudio({ inputPath, outputPath, audioOrder = 0 }) {
        await this.run([
            "-i", inputPath,
            "-map", `0:a:${audioOrder}`,
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            "-c:a", "pcm_s16le",
            outputPath
        ]);
    }

    async cutVideo({ inputPath, outputPath, startSec, durationSec }) {
        if (!(durationSec > 0)) {
            throw new Error(`Invalid clip duration: ${durationSec}`);
        }

        await this.run([
            "-ss", Math.max(0, startSec).toFixed(3),
            "-i", inputPath,
            "-t", durationSec.toFixed(3),
            "-map", "0:v:0",
            "-an",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            outputPath
        ]);
    }

    async muxVoice({ videoPath, audioPath, outputPath, durationSec }) {
        await this.run([
            "-i", videoPath,
            "-i", audioPath,
            "-filter_complex", "[1:a]apad[a]",
            "-map", "0:v:0",
            "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "48000",
            "-ac", "2",
            "-t", durationSec.toFixed(3),
            "-movflags", "+faststart",
            outputPath
        ]);
    }

    async concat({ listPath, outputPath }) {
        await this.run([
            "-f", "concat",
            "-safe", "0",
            "-i", listPath,
            "-c", "copy",
            "-movflags", "+faststart",
            outputPath
        ]);
    }
}

module.exports = new FFmpegService();
