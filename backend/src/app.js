const express = require("express");
const cors = require("cors");
const StorageService = require("../storage/StorageService");
const { inspectPage } = require("./controllers/inspect.controllers");

const app = express();

app.use(cors());
app.use(express.json());

/*
|--------------------------------------------------------------------------
| Pipeline Workers
| Movie index → DeepSeek recap (scene IDs) → TTS → best shot + vision check → assemble.
|--------------------------------------------------------------------------
*/

require("./workers/MetaDataWorker");
require("./workers/IndexWorker");
require("./workers/RecapWorker");
require("./workers/TtsWorker");
require("./workers/CutWorker");
require("./workers/AssembleWorker");

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

const jobRoute = require("./routes/jobs.route");

app.use("/api/v1", jobRoute);
app.use("/job-files", express.static(StorageService.root));
app.get("/inspect.html", inspectPage);
app.get("/inspect", inspectPage);

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
