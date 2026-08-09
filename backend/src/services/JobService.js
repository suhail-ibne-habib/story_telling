const { randomUUID } = require("crypto");
const JobStatus = require("../constance/jobStatus");

class JobService {

    constructor() {
        this.jobs = new Map();
    }

    create(filename, tmdbId) {

        if (!filename) {
            throw new Error("Filename is required");
        }

        const normalizedTmdbId = Number(tmdbId)

        if (!Number.isInteger(normalizedTmdbId) || normalizedTmdbId <= 0) {
            throw new Error(
                "Valid tmdbId is required"
            )
        }

        const jobId = randomUUID()

        const job = {
            id: jobId,
            filename,
            movie: {
                normalizedTmdbId
            },
            status: JobStatus.CREATED,
            stage: null,
            progress: 0,
            workspace: null,
            error: null,
            startedAt: null,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.jobs.set(job.id, job);

        console.log("Job created: ", job)

        return job;
    }

    get(jobId) {
        const job = this.jobs.get(jobId);

        return job ? { ...job } : null;
    }

    start(jobId) {
        const job = this.jobs.get(jobId);

        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        const startedJob = {
            ...job,
            status: JobStatus.RUNNING,
            startedAt: new Date(),
            updatedAt: new Date()
        }

        this.jobs.set(jobId, startedJob)

        console.log("Job Started: ", startedJob)

        return { ...startedJob };

    }

    async saveFilename(jobId, filename) {

        if (!filename) {
            throw new Error(
                "Filename is required."
            );
        }

        const paths =
            StorageService.getPaths(jobId);

        await fs.promises.mkdir(
            paths.metadata,
            {
                recursive: true
            }
        );

        const filePath =
            path.join(
                paths.metadata,
                "movie_file.json"
            );

        await fs.promises.writeFile(
            filePath,
            JSON.stringify(
                {
                    filename
                },
                null,
                2
            ),
            "utf-8"
        );

        console.log(
            `[JobService] Movie filename saved: ${filename}`
        );

        return filename;
    }


    async getFilename(jobId) {

        const paths =
            StorageService.getPaths(jobId);

        const filePath =
            path.join(
                paths.metadata,
                "movie_file.json"
            );

        if (!fs.existsSync(filePath)) {

            throw new Error(
                `Movie filename not found for job ${jobId}`
            );
        }

        const raw =
            await fs.promises.readFile(
                filePath,
                "utf-8"
            );

        const data =
            JSON.parse(raw);

        if (!data.filename) {

            throw new Error(
                `Movie filename is missing for job ${jobId}`
            );
        }

        return data.filename;
    }


}

module.exports = new JobService();