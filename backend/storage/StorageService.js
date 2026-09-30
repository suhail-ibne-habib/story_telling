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
            recap: path.join(root, "recap"),
            voice: path.join(root, "voice"),
            cut: path.join(root, "cut"),
            output: path.join(root, "output"),
            review: path.join(root, "review")
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
}

module.exports = new StorageService();
