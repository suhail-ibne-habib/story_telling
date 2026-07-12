const { execFile } = require('child_process')
const util = require('util')

const execFileAsync = util.promisify(execFile)

class FFmpegService {

    constructor() {
        this.binary = 'ffmpeg'
    }

    async extractAudio(inputMovie, outputAudio) {
        await execFileAsync(

            this.binary,

            [
                "-y",

                "-i",
                inputMovie,

                "-vn",

                "-acodec",
                "pcm_s16le",

                "-ar",
                "16000",

                "-ac",
                "1",

                outputAudio
            ]

        );
    }

}

module.exports = new FFmpegService()