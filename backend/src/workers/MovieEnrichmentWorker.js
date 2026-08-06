const StorageService = require("../../storage/StorageService");
const EventBus = require("../core/EventBus");
const events = require("../events/events");
const JobService = require("../services/JobService");
const MovieEnrichmentService = require("../services/MovieEnrichmentService");

const path = require('path')
const fs = require('fs')

EventBus.subscribe(
    events.METADATA_COMPLETED,
    async ({ jobId }) => {

        try {

            // 1. Get Movie ID
            const job = JobService.get(jobId)
            const movieId = job.movie.normalizedTmdbId

            // 2. Need Path to stor the MovieEnrichmentFile
            const paths = StorageService.getPaths(jobId)

            // Get characters json
            // MovieEnrichmentService requires movieId
            const enrichment = await MovieEnrichmentService.enrich(movieId)

            const movieEnrichmentFile = path.join(
                paths.metadata,
                'movie_enrichment.json'
            )

            const charactersFile = path.join(
                paths.characters,
                "characters.json"
            )

            await Promise.all([
                fs.promises.writeFile(
                    movieEnrichmentFile,
                    JSON.stringify(
                        enrichment.movie,
                        null,
                        2
                    )
                ),

                fs.promises.writeFile(
                    charactersFile,
                    JSON.stringify(
                        enrichment.characters,
                        null,
                        2
                    )
                )
            ])

            console.log(
                `Movie enriched: ${enrichment.movie.title}`
            );

            console.log(
                `Loaded ${enrichment.characters.length} characters`
            );

            EventBus.publish(
                events.MOVIE_ENRICHMENT_COMPLETED,
                {
                    jobId
                }
            )

        } catch (error) {
            console.error("Movie Enrichment worker failed..", error)

            EventBus.publish(
                events.MOVIE_ENRICHMENT_FAILED,
                {
                    jobId,
                    error: error.message
                }
            )
        }
    }
)