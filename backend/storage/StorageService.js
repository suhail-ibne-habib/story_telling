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
            proxy: path.join(root, "proxy"),
            events: path.join(root, "events"),
            voice: path.join(root, "voice"),
            output: path.join(root, "output")
        };
    }

    createWorkspace(jobId) {
        const paths = this.getPaths(jobId);

        Object.values(paths).forEach((directory) => {
            fs.mkdirSync(directory, { recursive: true });
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

    getProxyMovie(jobId) {
        return path.join(
            this.getPaths(jobId).proxy,
            "movie.mp4"
        );
    }

    getEventDir(jobId, eventId) {
        return path.join(
            this.getPaths(jobId).events,
            String(eventId)
        );
    }
}

module.exports = new StorageService();
