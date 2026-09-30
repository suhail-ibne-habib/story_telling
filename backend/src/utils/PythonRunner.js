const { spawn } = require("child_process");
const path = require("path");

const PYTHON_DIR = path.join(__dirname, "..", "..", "python");

function runPython(scriptName, args = [], { label } = {}) {
    const tag = label || scriptName;

    return new Promise((resolve, reject) => {
        const child = spawn(
            process.env.PYTHON || "python",
            [path.join(PYTHON_DIR, scriptName), ...args],
            {
                windowsHide: true,
                env: { ...process.env, PYTHONIOENCODING: "utf-8" }
            }
        );

        let stdout = "";
        let stderrTail = "";

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
            const text = chunk.toString();
            stderrTail = (stderrTail + text).slice(-4000);

            text.split(/\r?\n/)
                .filter((line) => line.trim())
                .forEach((line) => console.log(`[${tag}] ${line}`));
        });

        child.on("error", reject);

        child.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(
                    `${scriptName} exited with code ${code}: ${stderrTail.trim().slice(-800)}`
                ));
                return;
            }

            resolve(stdout.trim());
        });
    });
}

module.exports = { runPython };
