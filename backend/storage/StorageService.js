const fs = require("fs");
const path = require("path");

class StorageService {
    constructor() {
        this.root = path.join(process.cwd(), 'storage', 'jobs')
    }

    getPaths(jobId) {

        const root = path.join(this.root, jobId);

        return {

            root,
            input: path.join(root, "input"),
            metadata: path.join(root, "metadata"),
            audio: path.join(root, "audio"),
            transcript: path.join(root, "transcript"),
            shots: path.join(root, 'shots'),
            scenes: path.join(root, "scenes"),
            frames: path.join(root, "frames"),
            vision: path.join(root, "vision"),
            story: path.join(root, "story"),
            clips: path.join(root, "clips"),
            script: path.join(root, "script"),
            tts: path.join(root, "tts"),
            render: path.join(root, "render")

        };

    }

    createWorkspace(jobId) {
        const paths = this.getPaths(jobId)

        const directories = Object.values(paths)

        directories.forEach(dir => {
            fs.mkdirSync(dir, { recursive: true })
        })

        return paths
    }

    getInputMovie(filename) {
        const inputMoviePath = path.join(process.cwd(), 'storage', 'inputs', filename)

        return inputMoviePath
    }
}

module.exports = new StorageService()