const express = require('express')
const { createJob } = require('../controllers/job.controllers')

const route = express.Router()

route.post('/jobs', createJob);

module.exports = route