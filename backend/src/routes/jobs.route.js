const express = require("express");
const { createJob } = require("../controllers/job.controllers");
const {
    listJobs,
    inspectJob
} = require("../controllers/inspect.controllers");

const route = express.Router();

route.post("/jobs", createJob);
route.get("/jobs", listJobs);
route.get("/jobs/:jobId/inspect", inspectJob);

module.exports = route;
