const EventBus = require("../core/EventBus");
const ProgressService = require("../services/ProgressService");
const JobService = require("../services/JobService");

function subscribeStage({
    name,
    event,
    failEvent,
    stage,
    nextEvent,
    isDone,
    run,
    completeJob = false
}) {
    EventBus.subscribe(event, async ({ jobId }) => {
        try {
            console.log(
                `\n========== ${name} ==========`
            );
            console.log(
                `[${name}] Job ID: ${jobId}`
            );

            const progress = await ProgressService.load(jobId);
            const existing = progress?.stages?.[stage];

            if (
                existing?.status === "completed" &&
                (!isDone || await isDone(jobId))
            ) {
                console.log(
                    `[${name}] Stage already completed. Skipping.`
                );

                if (completeJob) {
                    await ProgressService.completeJob(jobId);
                    JobService.complete(jobId);
                } else if (nextEvent) {
                    EventBus.publish(nextEvent, { jobId });
                }

                return;
            }

            await ProgressService.startStage(jobId, stage);
            await run(jobId);
            await ProgressService.completeStage(jobId, stage);

            if (completeJob) {
                await ProgressService.completeJob(jobId);
                JobService.complete(jobId);
                console.log(
                    `[${name}] Pipeline finished. Open review/index.html.`
                );
            } else if (nextEvent) {
                EventBus.publish(nextEvent, { jobId });
            }

            console.log(
                "====================================\n"
            );
        } catch (error) {
            console.error(
                `[${name}] Worker failed:`,
                error
            );

            try {
                await ProgressService.failStage(
                    jobId,
                    stage,
                    error.message
                );
                JobService.fail(jobId, error.message);
            } catch (progressError) {
                console.error(
                    `[${name}] Failed to update progress:`,
                    progressError
                );
            }

            EventBus.publish(failEvent, {
                jobId,
                error: error.message
            });
        }
    });
}

module.exports = { subscribeStage };
