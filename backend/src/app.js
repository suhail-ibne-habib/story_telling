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
require("./workers/DownsampleWorker");
require("./workers/EventExtractionWorker");
require("./workers/ShotDetectionWorker");
require("./workers/ShotSelectionWorker");
require("./workers/VoiceoverWorker");

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
