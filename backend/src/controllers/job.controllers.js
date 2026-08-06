const express = require('express')
const ApiError = require('../utils/ApiError');
const JobService = require('../services/JobService');
const WorkflowEngine = require('../core/WorkflowEngine')
const asyncHandler = require('express-async-handler')

const createJob = asyncHandler(async (req, res) => {

    const { filename, tmdbId } = req.body;

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