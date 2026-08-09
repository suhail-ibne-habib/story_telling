const fs = require("fs");
const path = require("path");
const JobService = require("./JobService");

class ProgressService {

    getProgressPath(jobId) {

        const paths = Storage.getPaths(jobId);

        return path.join(
            paths.root,
            "progress.json"
        );

    }

    async initialize(jobId) {

        const progressPath =
            this.getProgressPath(jobId);

        if (fs.existsSync(progressPath)) {
            return;
        }

        const job = await JobService.get(jobId)

        const progress = {
            jobId,
            filename: job.filename,
            status: "running",
            currentStage: null,
            stages: {}
        };

        await fs.promises.writeFile(
            progressPath,
            JSON.stringify(
                progress,
                null,
                2
            )
        );

    }

    async load(jobId) {

        await this.initialize(jobId);

        const progressPath =
            this.getProgressPath(jobId);

        const raw =
            await fs.promises.readFile(
                progressPath,
                "utf-8"
            );

        return JSON.parse(raw);

    }

    async save(jobId, progress) {

        const progressPath =
            this.getProgressPath(jobId);

        await fs.promises.writeFile(
            progressPath,
            JSON.stringify(
                progress,
                null,
                2
            )
        );

    }

    async startStage(jobId, stageName) {

        const progress = await this.load(jobId);

        if (!progress) {
            throw new Error(
                `Progress not found for job: ${jobId}`
            )
        }

        progress.status = "running";
        progress.currentStage = stageName;

        if (!progress.stages[stageName]) {

            progress.stages[stageName] = {
                status: "running",
                startedAt: new Date().toISOString(),
                completedChunks: {}
            };

        } else {

            progress.stages[stageName].status =
                "running";

        }

        await this.save(
            jobId,
            progress
        );

    }

    async completeStage(jobId, stageName) {

        const progress =
            await this.load(jobId);

        progress.stages[stageName] ??= {};

        progress.stages[stageName].status =
            "completed";

        progress.stages[stageName].completedAt =
            new Date().toISOString();

        progress.currentStage = null;

        await this.save(
            jobId,
            progress
        );

    }

    async failStage(
        jobId,
        stageName,
        error
    ) {

        const progress =
            await this.load(jobId);

        progress.status = "failed";

        progress.currentStage =
            stageName;

        progress.stages[stageName] ??= {};

        progress.stages[stageName].status =
            "failed";

        progress.stages[stageName].failedAt =
            new Date().toISOString();

        progress.stages[stageName].error =
            error;

        await this.save(
            jobId,
            progress
        );

    }

    /*
    |--------------------------------------------------------------------------
    | CHUNK LEVEL
    |--------------------------------------------------------------------------
    */

    async completeChunk(
        jobId,
        stageName,
        chunkId
    ) {

        const progress =
            await this.load(jobId);

        progress.stages[stageName] ??= {
            status: "running",
            completedChunks: {}
        };

        progress.stages[stageName]
            .completedChunks ??= {};

        progress.stages[stageName]
            .completedChunks[chunkId] ??= {};

        progress.stages[stageName]
            .completedChunks[chunkId].status =
            "completed";

        progress.stages[stageName]
            .completedChunks[chunkId].completedAt =
            new Date().toISOString();

        await this.save(
            jobId,
            progress
        );

    }

    async isChunkCompleted(
        jobId,
        stageName,
        chunkId
    ) {

        const progress =
            await this.load(jobId);

        return Boolean(
            progress
                .stages
                ?.[stageName]
                ?.completedChunks
                ?.[chunkId]
                ?.status === "completed"
        );

    }

    /*
    |--------------------------------------------------------------------------
    | CONTACT SHEET LEVEL
    |--------------------------------------------------------------------------
    */

    async completeContactSheet(
        jobId,
        stageName,
        chunkId,
        contactSheetId
    ) {

        const progress =
            await this.load(jobId);

        progress.stages[stageName] ??= {
            status: "running",
            completedChunks: {}
        };

        const stage =
            progress.stages[stageName];

        stage.completedChunks ??= {};

        stage.completedChunks[chunkId] ??= {
            status: "running",
            contactSheets: {}
        };

        const chunkProgress =
            stage.completedChunks[chunkId];

        chunkProgress.contactSheets ??= {};

        chunkProgress.contactSheets[
            contactSheetId
        ] = {

            status: "completed",

            completedAt:
                new Date().toISOString()

        };

        await this.save(
            jobId,
            progress
        );

    }

    async isContactSheetCompleted(
        jobId,
        stageName,
        chunkId,
        contactSheetId
    ) {

        const progress =
            await this.load(jobId);

        return Boolean(
            progress
                .stages
                ?.[stageName]
                ?.completedChunks
                ?.[chunkId]
                ?.contactSheets
                ?.[contactSheetId]
                ?.status === "completed"
        );

    }

    async areAllContactSheetsCompleted(
        jobId,
        stageName,
        chunkId,
        contactSheetIds
    ) {

        for (
            const contactSheetId
            of contactSheetIds
        ) {

            const completed =
                await this.isContactSheetCompleted(
                    jobId,
                    stageName,
                    chunkId,
                    contactSheetId
                );

            if (!completed) {
                return false;
            }

        }

        return true;

    }

    /*
    |--------------------------------------------------------------------------
    | STAGE STATUS
    |--------------------------------------------------------------------------
    */

    async getCurrentStage(jobId) {

        const progress =
            await this.load(jobId);

        return progress.currentStage;

    }

    async isStageCompleted(
        jobId,
        stageName
    ) {

        const progress =
            await this.load(jobId);

        return (
            progress
                .stages
                ?.[stageName]
                ?.status === "completed"
        );

    }

    async isClipCompleted(
        jobId,
        stageName,
        clipId
    ) {
        const progress = await this.load(jobId);

        return Boolean(
            progress.stages
                ?.[stageName]
                ?.completedClips
                ?.[clipId]
                ?.status === "completed"
        );
    }

    async completeClip(
        jobId,
        stageName,
        clipId
    ) {
        const progress = await this.load(jobId);

        progress.stages[stageName] ??= {
            status: "running"
        };

        progress.stages[stageName].completedClips ??= {};

        progress.stages[stageName].completedClips[clipId] = {
            status: "completed",
            completedAt: new Date().toISOString()
        };

        await this.save(
            jobId,
            progress
        );
    }

}

module.exports = new ProgressService();