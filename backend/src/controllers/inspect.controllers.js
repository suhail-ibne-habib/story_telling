const InspectService = require("../services/InspectService");
const StorageService = require("../../storage/StorageService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("express-async-handler");
const fs = require("fs");

const listJobs = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        jobs: InspectService.listJobs()
    });
});

const inspectJob = asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const payload = InspectService.loadJob(jobId);

    if (!payload) {
        throw new ApiError(`Job not found: ${jobId}`, 404);
    }

    res.json({
        success: true,
        ...payload
    });
});

const inspectPage = asyncHandler(async (req, res) => {
    const htmlPath = require("path").join(
        __dirname,
        "../../../inspect.html"
    );

    if (!fs.existsSync(htmlPath)) {
        throw new ApiError("inspect.html was not found", 404);
    }

    res.sendFile(htmlPath);
});

const jobFilesRoot = () => StorageService.root;

module.exports = {
    listJobs,
    inspectJob,
    inspectPage,
    jobFilesRoot
};
