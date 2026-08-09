const {
    execFile
} = require("child_process");

const path = require("path");
const fs = require("fs");
const util = require("util");

const execFileAsync =
    util.promisify(execFile);


class ContactSheetService {

    constructor() {

        this.pythonBinary = "python";

        this.scriptPath =
            path.join(
                process.cwd(),
                "python",
                "create_contact_sheet.py"
            );


        /*
         * Python uses 4 columns.
         *
         * 16 images =
         * 4 x 4 grid.
         */

        this.maxImagesPerSheet = 16;

    }


    /**
     * Generate timestamp-burned contact sheets.
     *
     * Input:
     *
     * [
     *   {
     *      path: "...",
     *      timestamp: 4589.32
     *   }
     * ]
     */
    async generate(
        frames,
        outputDirectory
    ) {

        if (
            !Array.isArray(frames) ||
            frames.length === 0
        ) {

            throw new Error(
                "No frames were provided for contact sheet generation."
            );

        }


        /*
         * Validate input.
         */

        const validFrames =
            frames.filter(frame => {

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

            throw new Error(
                "No valid frame objects were provided."
            );

        }


        console.log(
            `[ContactSheetService] Generating contact sheets from ${validFrames.length} frames`
        );


        await fs.promises.mkdir(
            outputDirectory,
            {
                recursive: true
            }
        );


        /*
         * Split into groups.
         */

        const groups =
            this.splitFrames(validFrames);


        const contactSheets = [];


        let index = 1;


        for (
            const frameGroup of groups
        ) {

            console.log(
                `[ContactSheetService] Creating sheet ${index}/${groups.length} with ${frameGroup.length} frames`
            );


            const outputPath =
                this.buildOutputPath(
                    outputDirectory,
                    index
                );


            const metadataPath =
                this.buildMetadataPath(
                    outputDirectory,
                    index
                );


            /*
             * Python receives:
             *
             * [
             *   {
             *      path,
             *      timestamp
             *   }
             * ]
             */

            await fs.promises.writeFile(

                metadataPath,

                JSON.stringify(
                    frameGroup,
                    null,
                    2
                ),

                "utf-8"

            );


            try {

                await this.createSheet(
                    metadataPath,
                    outputPath
                );

            } finally {

                /*
                 * Always clean temporary metadata.
                 */

                try {

                    await fs.promises.unlink(
                        metadataPath
                    );

                } catch (error) {

                    /*
                     * Ignore cleanup failure.
                     */

                }

            }


            /*
             * Store complete temporal information.
             */

            contactSheets.push({

                id:
                    this.buildSheetId(index),

                path:
                    outputPath,

                frames:
                    frameGroup.map(frame => ({

                        path:
                            frame.path,

                        timestamp:
                            Number(
                                frame.timestamp
                            )

                    })),

                startTime:
                    Number(
                        frameGroup[0].timestamp
                    ),

                endTime:
                    Number(
                        frameGroup[
                            frameGroup.length - 1
                        ].timestamp
                    )

            });


            index++;

        }


        console.log(
            `[ContactSheetService] Generated ${contactSheets.length} contact sheets`
        );


        return contactSheets;

    }


    /**
     * Execute Python contact-sheet generator.
     */
    async createSheet(
        metadataPath,
        outputPath
    ) {

        const args = [

            this.scriptPath,

            outputPath,

            metadataPath

        ];


        console.log(
            "[ContactSheetService] Running Python generator..."
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
            stdout &&
            stdout.trim()
        ) {

            console.log(
                "[ContactSheet Python]",
                stdout.trim()
            );

        }


        if (
            stderr &&
            stderr.trim()
        ) {

            console.log(
                "[ContactSheet Python stderr]",
                stderr.trim()
            );

        }


        return stdout.trim();

    }


    splitFrames(frames) {

        const groups = [];


        for (
            let i = 0;

            i < frames.length;

            i += this.maxImagesPerSheet
        ) {

            groups.push(

                frames.slice(
                    i,
                    i + this.maxImagesPerSheet
                )

            );

        }


        return groups;

    }


    buildOutputPath(
        directory,
        index
    ) {

        return path.join(

            directory,

            `sheet_${this.pad(index)}.jpg`

        );

    }


    buildMetadataPath(
        directory,
        index
    ) {

        return path.join(

            directory,

            `.sheet_${this.pad(index)}_metadata.json`

        );

    }


    buildSheetId(index) {

        return `CS${this.pad(index)}`;

    }


    pad(value) {

        return String(value)
            .padStart(4, "0");

    }

}


module.exports =
    new ContactSheetService();