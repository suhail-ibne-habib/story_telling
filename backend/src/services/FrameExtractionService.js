const { execFile } = require(
    "child_process"
);

const path = require("path");
const util = require("util");

const execFileAsync = util.promisify(
    execFile
);

class FrameExtractionService {
    constructor() {
        this.binary = "ffmpeg";
    }

    async extract(
        videoPath,
        shots,
        outputDirectory
    ) {
        const extractedShots = [];

        for (const shot of shots) {
            const frames =
                await this.extractShotFrames(
                    videoPath,
                    shot,
                    outputDirectory
                );

            extractedShots.push({
                id: shot.id,
                start: shot.start,
                end: shot.end,
                duration: shot.duration,
                frames
            });
        }

        return extractedShots;
    }

    async extractShotFrames(
        videoPath,
        shot,
        outputDirectory
    ) {
        const timestamps =
            this.buildFrameTimestamps(shot);

        const frames = [];

        for (
            let index = 0;
            index < timestamps.length;
            index++
        ) {
            const frameIndex = index + 1;

            const timestamp =
                timestamps[index];

            const frameId =
                this.buildFrameId(
                    shot.id,
                    frameIndex
                );

            const filename =
                this.buildFilename(
                    shot.id,
                    frameIndex
                );

            const outputPath = path.join(
                outputDirectory,
                filename
            );

            await this.extractFrame(
                videoPath,
                timestamp,
                outputPath
            );

            frames.push({
                id: frameId,
                index: frameIndex,
                timestamp,
                path: outputPath
            });
        }

        return frames;
    }

    buildFrameTimestamps(shot) {
        const {
            start,
            duration
        } = shot;

        let positions;

        // if (duration < 1.5) {
        //     positions = [
        //         0.5
        //     ];
        // } else 

        if (duration < 5) {
            positions = [
                0.5
            ];
        } else {
            positions = [
                0.1,
                0.9
            ];
        }

        return positions.map(position => {
            const timestamp =
                start +
                duration * position;

            return Number(
                timestamp.toFixed(3)
            );
        });
    }

    async extractFrame(
        videoPath,
        timestamp,
        outputPath
    ) {
        await execFileAsync(
            this.binary,
            [
                "-ss",
                String(timestamp),

                "-i",
                videoPath,

                "-frames:v",
                "1",

                "-q:v",
                "2",

                "-y",

                outputPath
            ],
            {
                maxBuffer:
                    1024 * 1024 * 10
            }
        );
    }

    buildFrameId(
        shotId,
        frameIndex
    ) {
        return (
            `S${this.pad(shotId)}` +
            `_F${this.pad(frameIndex)}`
        );
    }

    buildFilename(
        shotId,
        frameIndex
    ) {
        return (
            `shot_${this.pad(shotId)}` +
            `_frame_${this.pad(frameIndex)}` +
            ".jpg"
        );
    }

    pad(value) {
        return String(value).padStart(
            4,
            "0"
        );
    }
}

module.exports =
    new FrameExtractionService();