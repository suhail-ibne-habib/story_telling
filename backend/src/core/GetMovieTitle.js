const JobService = require("../services/JobService");
const ProgressService = require("../services/ProgressService");

class MovieTitleService {

    async getTitle(jobId) {
        const job = JobService.get(jobId);

        if (job?.title) {
            return job.title;
        }

        const progress = await ProgressService.load(jobId);

        if (progress?.title) {
            return progress.title;
        }

        const filename = job?.filename || progress?.filename;

        if (filename) {
            return String(filename)
                .replace(/\.[^.]+$/, "")
                .replace(/[_]+/g, " ")
                .trim();
        }

        throw new Error(
            `Movie title not found for job: ${jobId}`
        );
    }
}

module.exports = new MovieTitleService();
