const express = require("express");
const cors = require("cors");
const connect = require("./database/connect");

const app = express();

app.use(cors());
app.use(express.json());

connect();

/*
|--------------------------------------------------------------------------
| Pipeline Workers
|--------------------------------------------------------------------------
*/

require("./workers/MetaDataWorker");
require("./workers/MovieEnrichmentWorker");
require("./workers/AudioWorker");
require("./workers/TranscriptWorker");
require("./workers/ShotDetectionWorker");
require("./workers/FrameExtractionWorker");
require("./workers/ChunkBuilderWorker")
require('./workers/ContactSheetWorker')
require('./workers/VisionAnalysisWorker')
require("./workers/ChunkAnalysisWorker")
require('./workers/MovieUnderstandingWorker')
require('./workers/StoryBeatPlanningWorker')
require('./workers/ShotMappingWorker')
require('./workers/ClipExtractionWorker')
require('./workers/ScriptGenerationWorker')
require('./workers/VoiceGenerationWorker')
require('./workers/VideoAssemblyWorker')


/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

const jobRoute = require("./routes/jobs.route");

app.use("/api/v1", jobRoute);

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
    res.send("Storytelling API is running");
});

/*
|--------------------------------------------------------------------------
| Error Handler
|--------------------------------------------------------------------------
*/

app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message
    });
});

module.exports = app;