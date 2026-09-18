const path = require("path");
const fs = require("fs");

const EventBus = require("../core/EventBus");
const events = require("../events/events");

const StorageService = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const EventExtractionService = require("../services/EventExtractionService");
const DownsampleService = require("../services/DownsampleService");
const JobService = require("../services/JobService");

const STAGES = require("../constance/pipelineStages");

EventBus.subscribe(

    events.DOWNSAMPLE_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== EVENT EXTRACTION WORKER =========="
            );

            console.log(
                `[EventExtraction] Job ID: ${jobId}`
            );

            const paths = StorageService.getPaths(jobId);
            const eventsPath = path.join(paths.events, "events.json");
            const manifestPath = path.join(paths.events, "manifest.json");
            const progress = await ProgressService.load(jobId);
            const stage = progress?.stages?.[STAGES.EVENT_EXTRACTION];

            if (
                stage?.status === "completed" &&
                fs.existsSync(eventsPath) &&
                fs.existsSync(manifestPath)
            ) {

                console.log(
                    "[EventExtraction] Stage already completed. Skipping."
                );

                EventBus.publish(
                    events.EVENT_EXTRACTION_COMPLETED,
                    { jobId }
                );

                return;
            }

            await fs.promises.mkdir(paths.events, { recursive: true });

            await ProgressService.startStage(
                jobId,
                STAGES.EVENT_EXTRACTION
            );

            const metadata = await DownsampleService.loadMetadata(jobId);
            const proxyPath = StorageService.getProxyMovie(jobId);

            if (!fs.existsSync(proxyPath)) {
                throw new Error(
                    `480p proxy not found: ${proxyPath}`
                );
            }

            const durationSec = Number(metadata.duration);

            console.log(
                `[EventExtraction] Uploading proxy (${durationSec.toFixed(1)}s) to Gemini`
            );

            const extracted = await EventExtractionService.extract({
                proxyPath,
                durationSec
            });

            await fs.promises.writeFile(
                path.join(paths.events, "gemini_request.json"),
                JSON.stringify(extracted.request, null, 2),
                "utf-8"
            );

            await fs.promises.writeFile(
                path.join(paths.events, "gemini_raw.txt"),
                extracted.raw || "",
                "utf-8"
            );

            await fs.promises.writeFile(
                eventsPath,
                JSON.stringify(extracted.result, null, 2),
                "utf-8"
            );

            await fs.promises.writeFile(
                manifestPath,
                JSON.stringify(
                    EventExtractionService.toPublicManifest(extracted.result),
                    null,
                    2
                ),
                "utf-8"
            );

            await ProgressService.completeStage(
                jobId,
                STAGES.EVENT_EXTRACTION
            );

            console.log(
                `[EventExtraction] ${extracted.result.full_recap.length} recap events`
            );

            EventBus.publish(
                events.EVENT_EXTRACTION_COMPLETED,
                { jobId }
            );

            console.log(
                "============================================\n"
            );

        } catch (error) {

            console.error(
                "[EventExtraction] Worker failed:",
                error
            );

            try {

                await ProgressService.failStage(
                    jobId,
                    STAGES.EVENT_EXTRACTION,
                    error.message
                );

                JobService.fail(jobId, error.message);

            } catch (progressError) {

                console.error(
                    "[EventExtraction] Failed to update progress:",
                    progressError
                );

            }

            EventBus.publish(
                events.EVENT_EXTRACTION_FAILED,
                {
                    jobId,
                    error: error.message
                }
            );

        }

    }

);
