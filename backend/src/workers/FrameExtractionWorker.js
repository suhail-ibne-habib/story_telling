const fs = require("fs");
const path = require("path");

const EventBus = require("../core/EventBus");
const events = require("../events/events");

const JobService = require(
    "../services/JobService"
);

const StorageService = require(
    "../../storage/StorageService"
);

const FrameExtractionService = require(
    "../services/FrameExtractionService"
);

EventBus.subscribe(
    events.SHOTS_COMPLETED,
    async ({ jobId }) => {
        try {
            console.log(
                "Frame extraction worker started..."
            );

            const job =
                JobService.get(jobId);

            const paths =
                StorageService.getPaths(jobId);

            const shotsFile = path.join(
                paths.shots,
                "shots.json"
            );

            const shotsRaw =
                await fs.promises.readFile(
                    shotsFile,
                    "utf-8"
                );

            const shots =
                JSON.parse(shotsRaw);

            const inputMovie =
                StorageService.getInputMovie(
                    job.filename
                );

            const extractedShots =
                await FrameExtractionService.extract(
                    inputMovie,
                    shots,
                    paths.frames
                );

            const framesFile = path.join(
                paths.frames,
                "frames.json"
            );

            await fs.promises.writeFile(
                framesFile,
                JSON.stringify(
                    extractedShots,
                    null,
                    2
                )
            );

            const totalFrames =
                extractedShots.reduce(
                    (total, shot) => {
                        return (
                            total +
                            shot.frames.length
                        );
                    },
                    0
                );

            console.log(
                `Extracted ${totalFrames} frames from ${extractedShots.length} shots`
            );

            EventBus.publish(
                events.FRAMES_COMPLETED,
                {
                    jobId
                }
            );

        } catch (error) {
            console.error(
                "Frame extraction failed!",
                error
            );

            EventBus.publish(
                events.FRAMES_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );
        }
    }
);