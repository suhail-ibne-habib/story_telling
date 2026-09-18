const path = require("path");
const fs = require("fs");

const EventBus = require("../core/EventBus");
const events = require("../events/events");

const StorageService = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const DownsampleService = require("../services/DownsampleService");
const JobService = require("../services/JobService");

const STAGES = require("../constance/pipelineStages");

EventBus.subscribe(

    events.METADATA_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== DOWNSAMPLE WORKER =========="
            );

            console.log(
                `[Downsample] Job ID: ${jobId}`
            );

            const proxyPath = StorageService.getProxyMovie(jobId);
            const progress = await ProgressService.load(jobId);
            const stage = progress?.stages?.[STAGES.DOWNSAMPLE];

            if (
                stage?.status === "completed" &&
                fs.existsSync(proxyPath)
            ) {

                console.log(
                    "[Downsample] Stage already completed. Skipping."
                );

                EventBus.publish(
                    events.DOWNSAMPLE_COMPLETED,
                    { jobId }
                );

                return;
            }

            await fs.promises.mkdir(
                StorageService.getPaths(jobId).proxy,
                { recursive: true }
            );

            await ProgressService.startStage(
                jobId,
                STAGES.DOWNSAMPLE
            );

            const result = await DownsampleService.downsample(jobId);

            await fs.promises.writeFile(
                path.join(
                    StorageService.getPaths(jobId).proxy,
                    "proxy.json"
                ),
                JSON.stringify(result, null, 2),
                "utf-8"
            );

            await ProgressService.completeStage(
                jobId,
                STAGES.DOWNSAMPLE
            );

            console.log(
                `[Downsample] Proxy: ${result.outputPath} (${(result.proxySize / (1024 * 1024)).toFixed(1)} MB)`
            );

            EventBus.publish(
                events.DOWNSAMPLE_COMPLETED,
                { jobId }
            );

            console.log(
                "======================================\n"
            );

        } catch (error) {

            console.error(
                "[Downsample] Worker failed:",
                error
            );

            try {

                await ProgressService.failStage(
                    jobId,
                    STAGES.DOWNSAMPLE,
                    error.message
                );

                JobService.fail(jobId, error.message);

            } catch (progressError) {

                console.error(
                    "[Downsample] Failed to update progress:",
                    progressError
                );

            }

            EventBus.publish(
                events.DOWNSAMPLE_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );

        }

    }

);
