const JobService = require("../services/JobService");
const ProgressService = require("../services/ProgressService");

class FileNameService {

    async getFileName(jobId) {

        /*
         * 1. Try JobService first
         */

        const job =
            JobService.get(jobId);

        if (job?.filename) {
            return job.filename;
        }


        /*
         * 2. Fallback to persisted progress
         */

        const progress =
            await ProgressService.load(jobId);

        if (progress?.filename) {
            return progress.filename;
        }


        /*
         * 3. Nothing found
         */

        throw new Error(
            `Movie filename not found for job: ${jobId}`
        );
    }
}

module.exports = new FileNameService();