const fs = require("fs");
const path = require("path");

const JobService = require("./JobService");
const StorageService = require("../../storage/StorageService");

class ProgressService {

    constructor() {

        /*
         * Each job gets its own promise queue.
         *
         * Example:
         *
         * job-A → operation → operation → operation
         * job-B → operation → operation
         *
         * Different jobs can operate concurrently.
         *
         * But operations for the SAME job are executed
         * one at a time.
         */

        this.jobLocks = new Map();

    }


    /*
     * Get progress.json path
     */

    getProgressPath(jobId) {

        const paths =
            StorageService.getPaths(jobId);

        return path.join(
            paths.root || paths.job,
            "progress.json"
        );

    }


    /*
     * Initialize progress file.
     *
     * This should be called once when the job
     * is created / registered.
     */

    async initialize(jobId) {

        const progressPath =
            this.getProgressPath(jobId);


        /*
         * If progress already exists,
         * don't overwrite it.
         */

        if (
            fs.existsSync(progressPath)
        ) {

            return;

        }


        const job =
            JobService.get(jobId);


        if (!job) {

            throw new Error(
                `Job not found: ${jobId}`
            );

        }


        if (!job.filename) {

            throw new Error(
                `Job ${jobId} does not have a filename`
            );

        }


        const progress = {

            jobId,

            filename:
                job.filename,

            status:
                "running",

            currentStage:
                null,

            stages:
                {}

        };


        await fs.promises.mkdir(

            path.dirname(
                progressPath
            ),

            {
                recursive: true
            }

        );


        await this.save(
            jobId,
            progress
        );

    }


    /*
     * Load existing progress.
     *
     * IMPORTANT:
     * load() does NOT initialize missing progress.
     *
     * If it doesn't exist, that's a real error.
     */

    async load(jobId) {

        await this.initialize(jobId);

        const progressPath =
            this.getProgressPath(jobId);


        if (
            !fs.existsSync(progressPath)
        ) {

            throw new Error(
                `Progress file not found for job: ${jobId}`
            );

        }


        const raw =
            await fs.promises.readFile(
                progressPath,
                "utf-8"
            );


        if (
            !raw.trim()
        ) {

            throw new Error(
                `Progress file is empty for job: ${jobId}`
            );

        }


        try {

            return JSON.parse(raw);

        } catch (error) {

            throw new Error(
                `Invalid progress JSON for job ${jobId}: ${error.message}`
            );

        }

    }


    /*
     * Save progress atomically.
     *
     * A unique temporary filename prevents
     * concurrent workers from fighting over
     * progress.json.tmp.
     */

    async save(jobId, progress) {

        const progressPath =
            this.getProgressPath(jobId);


        const tempPath =
            `${progressPath}.${process.pid}.${Date.now()}.${Math.random()
                .toString(16)
                .slice(2)}.tmp`;


        await fs.promises.mkdir(

            path.dirname(
                progressPath
            ),

            {
                recursive: true
            }

        );


        try {

            /*
             * Write complete JSON to temporary file.
             */

            await fs.promises.writeFile(

                tempPath,

                JSON.stringify(
                    progress,
                    null,
                    2
                ),

                "utf-8"

            );


            /*
             * Atomically replace progress.json.
             */

            await fs.promises.rename(

                tempPath,

                progressPath

            );


        } catch (error) {

            /*
             * Cleanup temporary file if
             * something goes wrong.
             */

            try {

                if (
                    fs.existsSync(tempPath)
                ) {

                    await fs.promises.unlink(
                        tempPath
                    );

                }

            } catch (cleanupError) {

                console.error(
                    "[ProgressService] Failed to cleanup temp file:",
                    cleanupError
                );

            }


            throw error;

        }

    }


    /*
     * Per-job lock.
     *
     * This is the important part.
     *
     * It protects the complete:
     *
     * load → modify → save
     *
     * operation.
     */

    async withJobLock(jobId, callback) {

        const previous =
            this.jobLocks.get(jobId) ||
            Promise.resolve();


        /*
         * Queue this operation after the
         * previous operation.
         */

        const current =
            previous.then(
                callback
            );


        /*
         * Keep the queue alive even if the
         * current operation fails.
         */

        this.jobLocks.set(

            jobId,

            current.catch(
                () => { }
            )

        );


        try {

            return await current;

        } finally {

            /*
             * Only remove the lock if this
             * operation is still the latest
             * queued operation.
             */

            const latest =
                this.jobLocks.get(jobId);


            if (
                latest
            ) {

                /*
                 * We intentionally leave the
                 * resolved promise here until
                 * the next operation replaces it.
                 *
                 * This avoids a race between
                 * finally blocks.
                 */

            }

        }

    }


    /*
     * Start a pipeline stage.
     */

    async startStage(
        jobId,
        stageName
    ) {

        return this.withJobLock(

            jobId,

            async () => {

                const progress =
                    await this.load(jobId);


                progress.status =
                    "running";


                progress.currentStage =
                    stageName;


                if (
                    !progress.stages
                ) {

                    progress.stages = {};

                }


                if (
                    !progress.stages[stageName]
                ) {

                    progress.stages[stageName] = {

                        status:
                            "running",

                        startedAt:
                            new Date().toISOString(),

                        completedChunks:
                            {}

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

        );

    }


    /*
     * Complete a pipeline stage.
     */

    async completeStage(
        jobId,
        stageName
    ) {

        return this.withJobLock(

            jobId,

            async () => {

                const progress =
                    await this.load(jobId);


                if (
                    !progress.stages
                ) {

                    progress.stages = {};

                }


                if (
                    !progress.stages[stageName]
                ) {

                    progress.stages[stageName] = {

                        startedAt:
                            null,

                        completedChunks:
                            {}

                    };

                }


                const stage =
                    progress.stages[stageName];


                stage.status =
                    "completed";


                stage.completedAt =
                    new Date().toISOString();


                progress.currentStage =
                    null;


                progress.status =
                    "running";


                await this.save(

                    jobId,

                    progress

                );

            }

        );

    }


    /*
     * Mark a stage as failed.
     */

    async failStage(
        jobId,
        stageName,
        errorMessage
    ) {

        return this.withJobLock(

            jobId,

            async () => {

                const progress =
                    await this.load(jobId);


                if (
                    !progress.stages
                ) {

                    progress.stages = {};

                }


                if (
                    !progress.stages[stageName]
                ) {

                    progress.stages[stageName] = {

                        startedAt:
                            null,

                        completedChunks:
                            {}

                    };

                }


                const stage =
                    progress.stages[stageName];


                stage.status =
                    "failed";


                stage.error =
                    errorMessage;


                stage.failedAt =
                    new Date().toISOString();


                progress.status =
                    "failed";


                progress.currentStage =
                    stageName;


                await this.save(

                    jobId,

                    progress

                );

            }

        );

    }


    /*
     * Update completed chunk.
     *
     * Useful later for chunk-level resume.
     *
     * Example:
     *
     * completedChunks: {
     *     CHUNK_0001: true,
     *     CHUNK_0002: true
     * }
     */

    async completeChunk(
        jobId,
        stageName,
        chunkId
    ) {

        return this.withJobLock(

            jobId,

            async () => {

                const progress =
                    await this.load(jobId);


                if (
                    !progress.stages
                ) {

                    progress.stages = {};

                }


                if (
                    !progress.stages[stageName]
                ) {

                    progress.stages[stageName] = {

                        status:
                            "running",

                        startedAt:
                            new Date().toISOString(),

                        completedChunks:
                            {}

                    };

                }


                const stage =
                    progress.stages[stageName];


                if (
                    !stage.completedChunks
                ) {

                    stage.completedChunks = {};

                }


                stage.completedChunks[
                    chunkId
                ] = true;


                await this.save(

                    jobId,

                    progress

                );

            }

        );

    }


    /*
     * Check whether a chunk is completed.
     */

    async isChunkCompleted(
        jobId,
        stageName,
        chunkId
    ) {

        const progress =
            await this.load(jobId);


        return Boolean(

            progress
                ?.stages
                ?.[stageName]
                ?.completedChunks
            ?.[chunkId]

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

        return (
            progress.stages?.[stageName]
                ?.chunks?.[chunkId]
                ?.contactSheets?.[contactSheetId]
                ?.status === "completed"
        );
    }


    async completeContactSheet(
        jobId,
        stageName,
        chunkId,
        contactSheetId
    ) {

        const progress =
            await this.load(jobId);

        progress.stages[stageName] ??= {};
        progress.stages[stageName].chunks ??= {};
        progress.stages[stageName].chunks[chunkId] ??= {};
        progress.stages[stageName].chunks[chunkId].contactSheets ??= {};

        progress.stages[stageName]
            .chunks[chunkId]
            .contactSheets[contactSheetId] = {

            status: "completed",

            completedAt:
                new Date().toISOString()

        };

        await this.save(
            jobId,
            progress
        );
    }


    async areAllContactSheetsCompleted(
        jobId,
        stageName,
        chunkId,
        contactSheetIds
    ) {

        const progress =
            await this.load(jobId);

        const contactSheets =
            progress.stages?.[stageName]
                ?.chunks?.[chunkId]
                ?.contactSheets || {};

        return contactSheetIds.every(
            contactSheetId =>
                contactSheets[contactSheetId]
                    ?.status === "completed"
        );
    }

}


module.exports =
    new ProgressService();