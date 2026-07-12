const { execFile } = require('child_process')
const util = require('util')

const execFileAsync = util.promisify(execFile)

class FrameExtractionService {
    constructor() {
        this.binary = 'ffmpeg'
    }

    async extract(videoPath, timestamp, outputFile) {
        await execFileAsync(
            this.binary,
            [
                "-y",
                "-ss",
                String(timestamp),
                "-i",
                videoPath,
                "-frames:v",
                "1",
                "-q:v",
                "2",
                outputFile
            ]
        )
    }
}

module.exports = new FrameExtractionService()