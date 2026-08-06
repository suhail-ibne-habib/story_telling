const { execFile } = require('child_process')
const path = require('path')
const util = require("util")

const execFileAsync = util.promisify(execFile)

class DuplicateFrameService {
    constructor() {
        this.pythonBinary = 'python',
            this.scriptPath = path.join(
                process.cwd(),
                "python",
                "remove_duplicate_frames.py"
            )

        this.threshold = 10;
    }

    async filter(framePaths) {
        if (!framePaths.length) {
            return []
        }

        const args = [
            this.scriptPath,
            this.threshold,
            ...framePaths
        ]

        const { stdout, stderr } = await execFileAsync(
            this.pythonBinary,
            args,
            {
                maxBuffer: 1024 * 1024 * 20
            }
        )

        if (stderr && stderr.trim()) {
            console.log(
                "[DuplicateFrameService]",
                stderr.trim()
            )
        }

        return {
            uniqueFrames: JSON.parse(stdout),
            originalCount: framePaths.length,
            uniqueCount: JSON.parse(stdout).length
        }

    }
}

module.exports = new DuplicateFrameService();