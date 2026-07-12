const express = require('express')
const cors = require('cors')
const connect = require('./database/connect')

const app = express()

app.use(cors())
app.use(express.json())
app.use((err, req, res, next) => {

    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message
    });

});

connect()

require('./workers/MetaDataWorker')
require('./workers/AudioWorker')
require('./workers/TranscriptWorker')
require("./workers/StoryTimelineWorker");
require('./workers/ShotDetectionWorker')
require('./workers/FrameExtractionWorker')
// require('./workers/VisionWorker')

const jobRoute = require('./routes/jobs.route')

app.use('/api/v1', jobRoute)

//Checking api running
app.get('/health', (req, res) => {
    try {
        res.send("Hello World")
    } catch (err) {
        console.error(err)
    }
})

module.exports = app