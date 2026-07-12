const { execFile } = require('child_process')
const util = require('util')
const path = require('path')

const execFileAsync = util.promisify(execFile)

class WhisperService {
    constructor() {
        this.binary = path.join(
            process.cwd(),
            "ai",
            "runtimes",
            "whisper",
            "whisper-cli.exe"
        );

        this.model = path.join(
            process.cwd(),
            "ai",
            "models",
            "whisper",
            "ggml-base.bin"
        );
    }

    async transcribe(audioFile, outputPrefix) {
        await execFileAsync(

            this.binary,

            [
                "-m",
                this.model,

                "-f",
                audioFile,

                "-oj",

                "-of",
                outputPrefix
            ]

        );
    }
}

module.exports = new WhisperService()