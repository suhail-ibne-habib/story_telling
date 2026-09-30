const ApiError = require("../utils/ApiError");
const JobService = require("../services/JobService");
const ResumeJobService = require("../services/ResumeJobService");
const WorkflowEngine = require("../core/WorkflowEngine");
const asyncHandler = require("express-async-handler");

const createJob = asyncHandler(async (req, res) => {

    const {
        filename,
        jobId,
        title,
        angles
    } = req.body;

    console.log("Filename: ", filename);
    console.log("Movie: ", title);
    console.log("Job ID: ", jobId);

    if (jobId) {

        const result =
            await ResumeJobService.resumeJob({
                jobId
            });

        return res.status(200).json({
            success: true,
            message: "Job resumed successfully",
            ...result
        });

    }

    if (!filename) {
        throw new ApiError("Filename is required", 400);
    }

    try {
        const job = JobService.create(filename, {
            title,
            angles
        });

        WorkflowEngine.start(job.id);

        res.status(201).json(job);
    } catch (error) {
        throw new ApiError(error.message, 400);
    }

});

module.exports = {
    createJob
};
