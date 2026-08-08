const express = require('express')
const ApiError = require('../utils/ApiError');
const JobService = require('../services/JobService');
const ResumeJobService = require('../services/ResumeJobService')
const WorkflowEngine = require('../core/WorkflowEngine')
const asyncHandler = require('express-async-handler')

const fs = require('fs')

const createJob = asyncHandler(async (req, res) => {

    const { filename, tmdbId, jobId } = req.body;

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

    const job = JobService.create(filename, tmdbId);

    WorkflowEngine.start(job.id);

    res.status(201).json(job);

});

module.exports = {
    createJob
}