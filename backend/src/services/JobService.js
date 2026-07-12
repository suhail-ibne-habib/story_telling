const { randomUUID } = require("crypto");
const JobStatus = require("../constance/jobStatus");

class JobService {

    constructor() {
        this.jobs = new Map();
    }

    create(filename) {

        if (!filename) {
            throw new Error("Filename is required");
        }

        const jobId = randomUUID()

        const job = {
            id: jobId,
            filename,
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


}

module.exports = new JobService();