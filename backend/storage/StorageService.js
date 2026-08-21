const fs = require("fs");
const path = require("path");

class StorageService {
    constructor() {
        this.root = path.join(
            process.cwd(),
            "storage",
            "jobs"
        );
    }

    getPaths(jobId) {
        const root = path.join(
            this.root,
            jobId
        );

        return {
            root,
            metadata: path.join(root, "metadata"),
            audio: path.join(root, "audio"),
            transcript: path.join(root, "transcript"),
            shots: path.join(root, "shots"),
            shotContext: path.join(root, "shot-context"),
            frames: path.join(root, "frames"),
            chunks: path.join(root, "chunks"),
            contactSheets: path.join(root, 'contact_sheets'),
            visualAnalysis: path.join(root, "visual_analysis"),
            chunkAnalysis: path.join(root, "chunk-analysis"),
            shotMapping: path.join(root, 'shot-mappings'),
            scripts: path.join(root, "scrips"),
            characters: path.join(root, "characters"),
            events: path.join(root, "events"),
            clips: path.join(root, "clips"),
            voice: path.join(root, "voice"),
        };
    }

    createWorkspace(jobId) {
        const paths = this.getPaths(jobId);

        const directories = Object.values(paths);

        directories.forEach(directory => {
            fs.mkdirSync(
                directory,
                {
                    recursive: true
                }
            );
        });

        return paths;
    }

    getInputMovie(filename) {
        return path.join(
            process.cwd(),
            "storage",
            "inputs",
            filename
        );
    }
}

module.exports = new StorageService();