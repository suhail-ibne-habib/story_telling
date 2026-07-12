const EventBus = require("../core/EventBus");
const events = require("../events/events");
const StorageService = require("../../storage/StorageService");
const VisionService = require("../services/VisionService");

const path = require("path");
const fs = require("fs");

EventBus.subscribe(
    events.FRAMES_COMPLETED,

    async ({ jobId }) => {
        try {
            console.log("Vision worker started...");

            const paths = StorageService.getPaths(jobId);

            const shotsFile = path.join(
                paths.shots,
                "shots.json"
            );

            const shotsRaw = await fs.promises.readFile(
                shotsFile,
                "utf-8"
            );

            const shots = JSON.parse(shotsRaw);

            const vision = [];

            for (const shot of shots) {
                const frameName =
                    `shot_${String(shot.id).padStart(3, "0")}.jpg`;

                const framePath = path.join(
                    paths.frames,
                    frameName
                );

                console.log(
                    `Analyzing shot ${shot.id}...`
                );

                const analysis = await VisionService.analyze(
                    framePath
                );

                vision.push({
                    shotId: shot.id,
                    ...analysis
                });
            }

            const visionFile = path.join(
                paths.vision,
                "vision.json"
            );

            await fs.promises.writeFile(
                visionFile,
                JSON.stringify(vision, null, 2)
            );

            EventBus.publish(
                events.VISION_COMPLETED,
                {
                    jobId
                }
            );

        } catch (error) {
            console.error(
                "Vision worker failed:",
                error
            );

            EventBus.publish(
                events.VISION_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );
        }
    }
);