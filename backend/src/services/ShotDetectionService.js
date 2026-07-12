const { execFile } = require('child_process')
const { time } = require('console')
const util = require('util')

const execFileAsync = util.promisify(execFile)

class ShotDetectionService {
    constructor() {
        this.binary = 'ffmpeg'
    }

    async detect(videoPath, duration) {
        const { stderr } = await execFileAsync(
            this.binary,
            [
                "-i",
                videoPath,

                "-vf",
                "select='gt(scene,0.3)',showinfo",

                "-f",
                "null",

                "-"
            ],
            {
                maxBuffer: 1024 * 1024 * 50
            }
        )

        const timestamps = this.parseTimestamps(stderr);

        return this.buildShots(timestamps, duration);
    }

    parseTimestamps(stderr) {
        const regex = /pts_time:(\d+(?:\.\d+)?)/g;

        const timestamps = [];

        let match;

        while ((match = regex.exec(stderr)) !== null) {
            timestamps.push(Number(match[1]));
        }
        return timestamps;
    }

    buildShots(timestamps, duration) {
        const validTimestamps = timestamps.filter(
            timestamp => timestamp > 0 && timestamp < duration
        );

        const boundaris = [0, ...validTimestamps, duration]

        const shots = []

        for (let i = 0; i < boundaris.length - 1; i++) {
            const start = boundaris[i]
            const end = boundaris[i + 1]
            const duration = Number((end - start).toFixed(3))

            shots.push({
                id: i + 1,
                start: Number(start.toFixed(3)),
                end: Number(end.toFixed(3)),
                duration
            })
        }

        return shots;
    }
}

module.exports = new ShotDetectionService()