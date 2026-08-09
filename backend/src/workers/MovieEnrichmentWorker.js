const StorageService = require("../../storage/StorageService");
const EventBus = require("../core/EventBus");
const events = require("../events/events");

const JobService = require("../services/JobService");
const ProgressService = require("../services/ProgressService");
const MovieEnrichmentService = require("../services/MovieEnrichmentService");

const STAGES = require("../constance/pipelineStages");

const path = require("path");
const fs = require("fs");


EventBus.subscribe(

    events.METADATA_COMPLETED,

    async ({ jobId }) => {

        try {

            console.log(
                "\n========== MOVIE ENRICHMENT WORKER STARTED =========="
            );


            /*
             * 1. Get job
             */

            const job = JobService.get(jobId);


            if (!job) {

                throw new Error(
                    `Job ${jobId} not found`
                );

            }


            /*
             * 2. Get TMDB movie ID
             */

            const movieId = job?.movie?.normalizedTmdbId;


            if (!movieId) {

                throw new Error(
                    `No normalizedTmdbId found for job ${jobId}`
                );

            }


            console.log(
                `[Movie Enrichment] TMDB ID: ${movieId}`
            );


            /*
             * 3. Get storage paths
             */

            const paths = StorageService.getPaths(jobId);


            /*
             * 4. Make sure required directories exist
             */

            await fs.promises.mkdir(
                paths.characters,
                {
                    recursive: true
                }
            )


            /*
             * 5. Output files
             */

            const movieEnrichmentFile =
                path.join(
                    paths.metadata,
                    "movie_enrichment.json"
                );


            const charactersFile =
                path.join(
                    paths.characters,
                    "characters.json"
                );


            /*
             * 6. Check progress
             *
             * If this stage has already completed,
             * don't call MovieEnrichmentService again.
             */

            const progress = await ProgressService.load(jobId);
            const enrichmentStage = progress?.stages?.[STAGES.MOVIE_ENRICHMENT];

            if (
                enrichmentStage?.status === "completed"
            ) {

                console.log(
                    "[Movie Enrichment] Stage already completed. Skipping."
                );


                EventBus.publish(
                    events.MOVIE_ENRICHMENT_COMPLETED,
                    {
                        jobId
                    }
                );


                return;

            }


            /*
             * 7. Start stage
             */

            await ProgressService.startStage(
                jobId,
                STAGES.MOVIE_ENRICHMENT
            );


            console.log(
                "[Movie Enrichment] Stage started."
            );


            /*
             * 9. Run movie enrichment
             */

            console.log(
                "[Movie Enrichment] Fetching movie enrichment..."
            );


            const enrichment = await MovieEnrichmentService.enrich(movieId);


            /*
             * 10. Validate response
             */

            if (!enrichment) {

                throw new Error(
                    "Movie enrichment returned no data."
                );

            }


            if (!enrichment.movie) {

                throw new Error(
                    "Movie enrichment response is missing movie data."
                );

            }


            if (
                !Array.isArray(
                    enrichment.characters
                )
            ) {

                throw new Error(
                    "Movie enrichment response is missing characters array."
                );

            }


            /*
             * 11. Save enrichment files
             */

            await Promise.all([

                fs.promises.writeFile(

                    movieEnrichmentFile,

                    JSON.stringify(
                        enrichment.movie,
                        null,
                        2
                    ),

                    "utf-8"

                ),

                fs.promises.writeFile(

                    charactersFile,

                    JSON.stringify(
                        enrichment.characters,
                        null,
                        2
                    ),

                    "utf-8"

                )

            ]);


            console.log(
                `[Movie Enrichment] Saved: ${movieEnrichmentFile}`
            );


            console.log(
                `[Movie Enrichment] Saved: ${charactersFile}`
            );


            console.log(
                `[Movie Enrichment] Movie: ${enrichment.movie.title}`
            );


            console.log(
                `[Movie Enrichment] Characters: ${enrichment.characters.length}`
            );


            /*
             * 12. Mark stage completed
             */

            await ProgressService.completeStage(
                jobId,
                STAGES.MOVIE_ENRICHMENT
            );


            console.log(
                "[Movie Enrichment] Stage completed."
            );


            /*
             * 13. Trigger next stage
             */

            EventBus.publish(

                events.MOVIE_ENRICHMENT_COMPLETED,

                {
                    jobId
                }

            );


            console.log(
                "============================================\n"
            );


        } catch (error) {

            console.error(
                "[Movie Enrichment] Worker failed:",
                error
            );


            /*
             * 14. Mark stage failed
             */

            try {

                await ProgressService.failStage(
                    jobId,
                    STAGES.MOVIE_ENRICHMENT,
                    error.message
                );

            } catch (progressError) {

                console.error(
                    "[Movie Enrichment] Failed to update progress:",
                    progressError
                );

            }


            /*
             * 15. Notify pipeline
             */

            EventBus.publish(

                events.MOVIE_ENRICHMENT_FAILED,

                {
                    jobId,
                    error: error.message
                }

            );

        }

    }

);