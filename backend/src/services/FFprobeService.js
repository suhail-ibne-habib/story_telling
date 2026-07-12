const { execFile } = require("child_process")
const util = require('util')

const execFileAsync = util.promisify(execFile)

class FFprobService {

    constructor() {
        this.binary = 'ffprobe'
    }

    async extract(videoPath) {
        try {

            const { stdout } = await execFileAsync(
                this.binary,
                [
                    "-v", "quiet",
                    "-print_format", "json",
                    "-show_format",
                    "-show_streams",
                    videoPath
                ]
            )

            const metaData = JSON.parse(stdout)

            return this.normalize(metaData)

        } catch (error) {
            throw new Error(
                `FFprob Failed ${error.message}`
            )
        }

    }

    normalize(raw) {
        const video = raw.streams.find(s => s.codec_type === 'video')
        const audio = raw.streams.find(s => s.codec_type === 'audio')

        return {
            duration: Number(raw.format.duration),
            size: Number(raw.format.size),
            bitrate: Number(raw.format.bit_rate),
            container: raw.format.format_name,
            video,
            audio,
        }
    }

}

module.exports = new FFprobService()