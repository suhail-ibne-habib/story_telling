const ShotMappingPromptBuilderService =
    require("./ShotMappingPromptBuilderService");

const DeepSeekService =
    require("./DeepSeekService");


class ShotMappingService {

    async mapBeat({
        beat,
        chunkContexts
    }) {

        const {
            system,
            user
        } =
            ShotMappingPromptBuilderService.build({
                beat,
                chunkContexts
            });


        console.log(
            "\n========== SHOT MAPPING ==========\n"
        );

        console.log({
            beatId: beat.id,
            chunkCount: chunkContexts.length,
            systemLength: system.length,
            userLength: user.length
        });


        const response =
            await DeepSeekService.generate({
                system,
                user
            });


        const content =
            typeof response === "string"
                ? response
                : response?.content;


        if (!content || !content.trim()) {

            throw new Error(
                `Empty shot mapping response for ${beat.id}`
            );

        }


        console.log(
            "\n========== RAW SHOT MAPPING RESPONSE ==========\n"
        );

        console.log(content);


        /*
         * -----------------------------------------
         * Parse JSON
         * -----------------------------------------
         */

        let selection;


        try {

            let cleaned =
                content.trim();


            /*
             * Remove markdown fences if present.
             */

            cleaned =
                cleaned
                    .replace(
                        /^```json\s*/i,
                        ""
                    )
                    .replace(
                        /^```\s*/i,
                        ""
                    )
                    .replace(
                        /\s*```$/i,
                        ""
                    )
                    .trim();


            selection =
                JSON.parse(cleaned);

        } catch (error) {

            console.error(
                "[ShotMapping] Invalid JSON:"
            );

            console.error(content);

            throw new Error(
                `Invalid shot mapping JSON for ${beat.id}: ${error.message}`
            );

        }


        /*
         * -----------------------------------------
         * Build source shot lookup
         * -----------------------------------------
         */

        const shotLookup =
            new Map();


        for (
            const context
            of chunkContexts
        ) {

            if (
                !Array.isArray(
                    context.shots
                )
            ) {

                continue;

            }


            for (
                const shot
                of context.shots
            ) {

                const shotId =
                    shot.shotId ??
                    shot.id;


                if (
                    shotId === undefined ||
                    shotId === null
                ) {

                    continue;

                }


                shotLookup.set(
                    String(shotId),
                    {
                        ...shot,

                        chunkId:
                            context.chunkId
                    }
                );

            }

        }


        /*
         * -----------------------------------------
         * Get selected IDs
         * -----------------------------------------
         */

        const selectedIds =
            Array.isArray(
                selection.selectedShotIds
            )
                ? selection.selectedShotIds
                : [];


        /*
         * -----------------------------------------
         * If LLM selected nothing
         * -----------------------------------------
         *
         * Do NOT kill the whole pipeline.
         *
         * Save an empty mapping and continue.
         * -----------------------------------------
         */

        if (
            selectedIds.length === 0
        ) {

            console.warn(
                `[ShotMapping] ${beat.id}: LLM selected no shots.`
            );


            return {

                beatId:
                    beat.id,

                chunkIds: [],

                selectedShots: [],

                cut: null,

                reason:
                    "No matching source shot was selected by the model."

            };

        }


        /*
         * -----------------------------------------
         * Resolve actual shots
         * -----------------------------------------
         */

        const selectedShots = [];


        for (
            const shotId
            of selectedIds
        ) {

            const shot =
                shotLookup.get(
                    String(shotId)
                );


            if (!shot) {

                console.warn(
                    `[ShotMapping] ${beat.id}: ` +
                    `LLM selected unknown shot ${shotId}.`
                );

                continue;

            }


            selectedShots.push(
                shot
            );

        }


        /*
         * -----------------------------------------
         * If none of the IDs exist
         * -----------------------------------------
         */

        if (
            selectedShots.length === 0
        ) {

            console.warn(
                `[ShotMapping] ${beat.id}: no valid source shots found.`
            );


            return {

                beatId:
                    beat.id,

                chunkIds: [],

                selectedShots: [],

                cut: null,

                reason:
                    "The model selected shot IDs that were not present in the source data."

            };

        }


        /*
         * -----------------------------------------
         * Sort by actual source time
         * -----------------------------------------
         */

        selectedShots.sort(
            (
                a,
                b
            ) => {

                return (
                    this.toSeconds(
                        a.start ??
                        a.startTime
                    )
                    -
                    this.toSeconds(
                        b.start ??
                        b.startTime
                    )
                );

            }
        );


        /*
         * -----------------------------------------
         * Remove duplicate shots
         * -----------------------------------------
         */

        const uniqueShots = [];

        const seen =
            new Set();


        for (
            const shot
            of selectedShots
        ) {

            const shotId =
                shot.shotId ??
                shot.id;


            const key =
                String(shotId);


            if (
                seen.has(key)
            ) {

                continue;

            }


            seen.add(key);

            uniqueShots.push(
                shot
            );

        }


        /*
         * -----------------------------------------
         * Calculate source range
         * -----------------------------------------
         */

        const firstShot =
            uniqueShots[0];


        const lastShot =
            uniqueShots[
            uniqueShots.length - 1
            ];


        const startTime =
            firstShot.start ??
            firstShot.startTime;


        const endTime =
            lastShot.end ??
            lastShot.endTime;


        const startSeconds =
            this.toSeconds(
                startTime
            );


        const endSeconds =
            this.toSeconds(
                endTime
            );


        if (
            !Number.isFinite(startSeconds) ||
            !Number.isFinite(endSeconds)
        ) {

            throw new Error(
                `Invalid source timestamps for ${beat.id}`
            );

        }


        const duration =
            endSeconds -
            startSeconds;


        /*
         * -----------------------------------------
         * Chunk IDs
         * -----------------------------------------
         */

        const chunkIds = [
            ...new Set(
                uniqueShots.map(
                    shot =>
                        shot.chunkId
                )
            )
        ];


        /*
         * -----------------------------------------
         * Final mapping
         * -----------------------------------------
         */

        const mapping = {

            beatId:
                beat.id,

            chunkIds,

            selectedShots:
                uniqueShots.map(
                    shot => ({

                        shotId:
                            shot.shotId ??
                            shot.id,

                        startTime:
                            shot.start ??
                            shot.startTime,

                        endTime:
                            shot.end ??
                            shot.endTime

                    })
                ),

            cut: {

                startTime,

                endTime,

                duration:
                    Number(
                        duration.toFixed(3)
                    )

            },

            reason:
                selection.reason ||
                "Source shots selected by the shot mapping model."

        };


        console.log(
            "\n========== FINAL SHOT MAPPING ==========\n"
        );

        console.log(
            JSON.stringify(
                mapping,
                null,
                2
            )
        );


        return mapping;

    }


    toSeconds(timestamp) {

        if (
            timestamp === undefined ||
            timestamp === null
        ) {

            return NaN;

        }


        if (
            typeof timestamp === "number"
        ) {

            return timestamp;

        }


        const value =
            String(timestamp).trim();


        /*
         * MM:SS.mmm
         */

        const match =
            value.match(
                /^(\d+):(\d+(?:\.\d+)?)$/
            );


        if (match) {

            return (
                Number(match[1]) * 60 +
                Number(match[2])
            );

        }


        const numeric =
            Number(value);


        return Number.isFinite(numeric)
            ? numeric
            : NaN;

    }

}


module.exports =
    new ShotMappingService();