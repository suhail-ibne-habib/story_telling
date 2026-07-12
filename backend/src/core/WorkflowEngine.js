const JobService = require('../services/JobService')
const EventBus = require('./EventBus')
const events = require('../events/events')
const StorageService = require('../../storage/StorageService')

class WorkflowEngine {
    start(jobId) {
        StorageService.createWorkspace(jobId)

        JobService.start(jobId)

        EventBus.publish(
            events.MOVIE_REGISTERED,
            { jobId }
        )
    }

}

module.exports = new WorkflowEngine()