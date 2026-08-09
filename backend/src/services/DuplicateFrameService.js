const { execFile } = require("child_process");
const path = require("path");
const util = require("util");

const execFileAsync = util.promisify(execFile);

class DuplicateFrameService {

    constructor() {

        this.pythonBinary = "python";

        this.scriptPath = path.join(
            process.cwd(),
            "python",
            "remove_duplicate_frames.py"
        );

        this.threshold = 10;
    }


    /**
     * Remove visually duplicate frames.
     *
     * Input:
     *
     * [
     *   {
     *      path: "/frames/frame_001.jpg",
     *      timestamp: 120.32
     *   },
     *   {
     *      path: "/frames/frame_002.jpg",
     *      timestamp: 121.45
     *   }
     * ]
     *
     * Output:
     *
     * {
     *   uniqueFrames: [
     *      {
     *          path,
     *          timestamp
     *      }
     *   ],
     *   originalCount,
     *   uniqueCount
     * }
     */
    async filter(frameData) {

        if (
            !Array.isArray(frameData) ||
            frameData.length === 0
        ) {

            return {
                uniqueFrames: [],
                originalCount: 0,
                uniqueCount: 0
            };

        }


        /*
         * Validate frame objects.
         */

        const validFrames =
            frameData.filter(frame => {

                return (
                    frame &&
                    typeof frame.path === "string" &&
                    frame.path.length > 0 &&
                    Number.isFinite(
                        Number(frame.timestamp)
                    )
                );

            });


        if (!validFrames.length) {

            return {
                uniqueFrames: [],
                originalCount: frameData.length,
                uniqueCount: 0
            };

        }


        /*
         * Python only needs image paths
         * for visual duplicate detection.
         */

        const framePaths =
            validFrames.map(
                frame => frame.path
            );


        const args = [

            this.scriptPath,

            String(this.threshold),

            ...framePaths

        ];


        console.log(
            `[DuplicateFrameService] Checking ${framePaths.length} frames...`
        );


        const {
            stdout,
            stderr
        } = await execFileAsync(

            this.pythonBinary,

            args,

            {
                maxBuffer:
                    1024 * 1024 * 50
            }

        );


        if (
            stderr &&
            stderr.trim()
        ) {

            console.log(
                "[DuplicateFrameService]",
                stderr.trim()
            );

        }


        if (
            !stdout ||
            !stdout.trim()
        ) {

            throw new Error(
                "DuplicateFrameService returned empty output."
            );

        }


        let uniquePaths;

        try {

            uniquePaths =
                JSON.parse(
                    stdout.trim()
                );

        } catch (error) {

            throw new Error(
                `Failed to parse duplicate-frame output: ${error.message}`
            );

        }


        if (
            !Array.isArray(uniquePaths)
        ) {

            throw new Error(
                "DuplicateFrameService returned invalid data."
            );

        }


        /*
         * CRITICAL:
         *
         * Python returns paths.
         *
         * We restore the original timestamp
         * information here.
         */

        const frameMap =
            new Map(
                validFrames.map(frame => [
                    path.resolve(frame.path),
                    frame
                ])
            );


        const uniqueFrames = [];


        for (const uniquePath of uniquePaths) {

            const normalizedPath =
                path.resolve(uniquePath);


            const originalFrame =
                frameMap.get(normalizedPath);


            if (!originalFrame) {

                console.warn(
                    `[DuplicateFrameService] Could not find metadata for: ${uniquePath}`
                );

                continue;

            }


            uniqueFrames.push({

                path:
                    originalFrame.path,

                timestamp:
                    Number(
                        originalFrame.timestamp
                    )

            });

        }


        /*
         * Keep chronological order.
         */

        uniqueFrames.sort(
            (a, b) =>
                a.timestamp - b.timestamp
        );


        return {

            uniqueFrames,

            originalCount:
                frameData.length,

            uniqueCount:
                uniqueFrames.length

        };

    }

}


module.exports =
    new DuplicateFrameService();