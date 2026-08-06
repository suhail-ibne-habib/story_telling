const { execFile } = require("child_process");
const path = require("path");
const util = require("util");

const execFileAsync = util.promisify(execFile);

class ShotDetectionService {
    constructor() {
        this.pythonBinary = "python";

        this.scriptPath = path.join(
            process.cwd(),
            "python",
            "detect_shots.py"
        );
    }

    async detect(videoPath) {
        const { stdout, stderr } = await execFileAsync(
            this.pythonBinary,
            [
                this.scriptPath,
                videoPath
            ],
            {
                maxBuffer: 1024 * 1024 * 50
            }
        );

        if (stderr && stderr.trim()) {
            console.log(
                "[ShotDetectionService]",
                stderr.trim()
            );
        }

        const output = stdout.trim();

        if (!output) {
            throw new Error(
                "PySceneDetect returned empty output"
            );
        }

        try {
            return JSON.parse(output);
        } catch (error) {
            console.error(
                "PySceneDetect raw output:",
                output
            );

            throw new Error(
                `Failed to parse PySceneDetect output ${error.message}`
            );
        }
    }
}

module.exports = new ShotDetectionService();