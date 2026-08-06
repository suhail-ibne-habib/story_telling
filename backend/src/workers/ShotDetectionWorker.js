const fs = require("fs");
const path = require("path");

const EventBus = require("../core/EventBus");
const events = require("../events/events");
const JobService = require("../services/JobService");
const StorageService = require("../../storage/StorageService");
const ShotDetectionService = require(
    "../services/ShotDetectionService"
);

EventBus.subscribe(
    events.TRANSCRIPT_COMPLETED,
    async ({ jobId }) => {
        try {
            console.log(
                "Shot detection worker started..."
            );

            const job = JobService.get(jobId);

            const paths = StorageService.getPaths(jobId);

            const inputMovie =
                StorageService.getInputMovie(
                    job.filename
                );

            const shots =
                await ShotDetectionService.detect(
                    inputMovie
                );

            const shotFile = path.join(
                paths.shots,
                "shots.json"
            );

            await fs.promises.writeFile(
                shotFile,
                JSON.stringify(
                    shots,
                    null,
                    2
                )
            );

            console.log(
                `Detected ${shots.length} shots`
            );

            EventBus.publish(
                events.SHOTS_COMPLETED,
                {
                    jobId
                }
            );

        } catch (error) {
            console.error(
                "Shot detection failed!",
                error
            );

            EventBus.publish(
                events.SHOTS_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );
        }
    }
);