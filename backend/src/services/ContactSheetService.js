const { execFile } = require("child_process")
const path = require("path")
const util = require('util')

const execFileAsync = util.promisify(execFile)

class ContactSheetService {
    constructor() {
        this.pythonBinary = 'python'
        this.scriptPath = path.join(
            process.cwd(),
            "python",
            "create_contact_sheet.py"
        )
        this.maxImagesPerSheet = 16;
    }

    async generate(
        imagePaths,
        outputDirectory
    ) {
        if (!imagePaths.length) {
            throw new Error(
                "No images were provided."
            );
        }

        const groups = this.splitImages(
            imagePaths
        );

        const contactSheets = [];

        let index = 1;

        for (const images of groups) {

            const outputPath =
                this.buildOutputPath(
                    outputDirectory,
                    index
                );

            await this.createSheet(
                images,
                outputPath
            );

            contactSheets.push({
                id: this.buildSheetId(index),
                path: outputPath
            });

            index++;
        }

        return contactSheets;
    }

    async createSheet(
        imagePaths,
        outputPath
    ) {
        const args = [
            this.scriptPath,
            outputPath,
            ...imagePaths
        ];

        const { stdout, stderr } =
            await execFileAsync(
                this.pythonBinary,
                args,
                {
                    maxBuffer:
                        1024 * 1024 * 20
                }
            );

        if (
            stderr &&
            stderr.trim()
        ) {
            console.log(
                "[ContactSheetService]",
                stderr.trim()
            );
        }

        return stdout.trim();
    }

    splitImages(imagePaths) {
        const groups = []

        for (
            let i = 0;
            i < imagePaths.length;
            i += this.maxImagesPerSheet
        ) {
            groups.push(
                imagePaths.slice(
                    i,
                    i + this.maxImagesPerSheet
                )
            )
        }

        return groups
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

    buildSheetId(index) {
        return `CS${this.pad(index)}`;
    }

    pad(value) {
        return String(value).padStart(
            4,
            "0"
        );
    }
}

module.exports = new ContactSheetService();