const GetMovieTitle = require("./GetMovieTitle");

class MovieIdentityService {

    async getIdentity(jobId) {
        const title = await GetMovieTitle.getTitle(jobId);

        if (!title) {
            throw new Error(
                `Movie name is required for job: ${jobId}`
            );
        }

        return {
            title
        };
    }
}

module.exports = new MovieIdentityService();
