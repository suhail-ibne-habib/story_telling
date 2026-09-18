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

    complete(jobId) {
        const job = this.jobs.get(jobId);

        if (!job) {
            return null;
        }

        const completedJob = {
            ...job,
            status: JobStatus.COMPLETED,
            progress: 100,
            stage: null,
            updatedAt: new Date()
        };

        this.jobs.set(jobId, completedJob);

        console.log("Job completed: ", completedJob);

        return { ...completedJob };
    }

    fail(jobId, error) {
        const job = this.jobs.get(jobId);

        if (!job) {
            return null;
        }

        const failedJob = {
            ...job,
            status: JobStatus.FAILED,
            error: error || null,
            updatedAt: new Date()
        };

        this.jobs.set(jobId, failedJob);

        return { ...failedJob };
    }

}

module.exports = new JobService();
