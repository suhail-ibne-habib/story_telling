const fs = require("fs");
const path = require("path");

const Storage = require("../../storage/StorageService");


class ShotMapperService {

    async map(jobId) {

        const paths = Storage.getPaths(jobId);

        console.log("\n========================================");
        console.log("[ShotMapper] Starting...");
        console.log("========================================\n");


        /*
         * --------------------------------------------------
         * 1. Load story beats
         * --------------------------------------------------
         */

        const storyBeatsPath = path.join(
            paths.metadata,
            "story_beats.json"
        );

        console.log(
            "[ShotMapper] Loading story beats..."
        );

        const storyBeatsRaw =
            await fs.promises.readFile(
                storyBeatsPath,
                "utf-8"
            );

        const storyBeats =
            JSON.parse(storyBeatsRaw);


        if (
            !Array.isArray(storyBeats.beats)
        ) {

            throw new Error(
                "story_beats.json does not contain a valid beats array."
            );

        }


        const targetDuration =
            Number(storyBeats.targetDuration) || 360;


        console.log({
            targetDuration,
            beatCount: storyBeats.beats.length
        });


        /*
         * --------------------------------------------------
         * 2. Load chunks
         * --------------------------------------------------
         */

        console.log(
            "[ShotMapper] Loading original chunks..."
        );

        const chunkFiles =
            await fs.promises.readdir(
                paths.chunks
            );


        const chunks = new Map();


        for (
            const file of chunkFiles
                .filter(file => file.endsWith(".json"))
                .sort()
        ) {

            const chunkPath =
                path.join(
                    paths.chunks,
                    file
                );


            const raw =
                await fs.promises.readFile(
                    chunkPath,
                    "utf-8"
                );


            const chunk =
                JSON.parse(raw);


            if (!chunk.id) {
                console.warn(
                    `[ShotMapper] Chunk ${file} has no id.`
                );

                continue;
            }


            chunks.set(
                chunk.id.toLowerCase(),
                chunk
            );

        }


        console.log(
            `[ShotMapper] Loaded ${chunks.size} chunks.`
        );


        /*
         * --------------------------------------------------
         * 3. Deduplicate beats
         * --------------------------------------------------
         */

        const beats =
            this.deduplicateBeats(
                storyBeats.beats
            );


        console.log(
            `[ShotMapper] ${beats.length} unique beats remain.`
        );


        /*
         * --------------------------------------------------
         * 4. Map beats to candidate clips
         * --------------------------------------------------
         */

        const candidates = [];


        for (
            const beat of beats
        ) {

            console.log(
                `\n[ShotMapper] Processing ${beat.id}`
            );

            console.log(
                `Description: ${beat.description}`
            );


            if (!beat.chunkId) {

                console.warn(
                    `[ShotMapper] ${beat.id} has no chunkId.`
                );

                continue;

            }


            const chunk =
                chunks.get(
                    beat.chunkId.toLowerCase()
                );


            if (!chunk) {

                console.warn(
                    `[ShotMapper] Chunk not found: ${beat.chunkId}`
                );

                continue;

            }


            /*
             * Make sure the chunk actually has shots.
             */

            if (
                !Array.isArray(chunk.shots) ||
                chunk.shots.length === 0
            ) {

                console.warn(
                    `[ShotMapper] ${chunk.id} contains no shots.`
                );

                continue;

            }


            /*
             * Try to locate the actual moment.
             */

            const mapping =
                await this.findBestShotsForBeat(
                    beat,
                    chunk,
                    paths
                );


            if (
                !mapping ||
                !mapping.shots.length
            ) {

                console.warn(
                    `[ShotMapper] No shots found for ${beat.id}`
                );

                continue;

            }


            const shots =
                this.ensureChronologicalShots(
                    mapping.shots
                );


            const start =
                shots[0].start;


            const end =
                shots[shots.length - 1].end;


            const duration =
                end - start;


            candidates.push({

                beat,

                shots,

                start,

                end,

                duration,

                source:
                    mapping.source

            });


            console.log({
                beat: beat.id,
                source: mapping.source,
                shots: shots.length,
                start,
                end,
                duration
            });

        }


        console.log(
            `\n[ShotMapper] Candidate clips: ${candidates.length}`
        );


        /*
         * --------------------------------------------------
         * 5. Enforce duration budget
         * --------------------------------------------------
         */

        const selected =
            this.enforceBudget(
                candidates,
                targetDuration
            );


        /*
         * --------------------------------------------------
         * 6. Narrative order
         * --------------------------------------------------
         */

        selected.sort(
            (a, b) =>
                a.beat.order - b.beat.order
        );


        /*
         * --------------------------------------------------
         * 7. Resolve overlaps
         * --------------------------------------------------
         */

        const finalClips =
            this.resolveOverlaps(
                selected
            );


        /*
         * --------------------------------------------------
         * 8. Build final clip plan
         * --------------------------------------------------
         */

        const clips =
            finalClips.map(
                (item, index) => {

                    const importance =
                        Number(
                            item.beat.importance
                        ) || 0;


                    return {

                        id:
                            `CL${String(index + 1).padStart(3, "0")}`,

                        start:
                            item.start,

                        end:
                            item.end,

                        duration:
                            Number(
                                (
                                    item.end -
                                    item.start
                                ).toFixed(3)
                            ),

                        beatId:
                            item.beat.id,

                        chunkId:
                            item.beat.chunkId,

                        shots:
                            item.shots.map(
                                shot => shot.id
                            ),

                        purpose:
                            item.beat.narrativePurpose,

                        importance:
                            importance >= 0.9
                                ? "high"
                                : importance >= 0.7
                                    ? "medium"
                                    : "low",

                        summary:
                            item.beat.description,

                        reason:
                            item.beat.narrativePurpose,

                        mappingSource:
                            item.source

                    };

                }
            );


        /*
         * --------------------------------------------------
         * 9. Calculate actual duration
         * --------------------------------------------------
         */

        const actualDuration =
            clips.reduce(
                (total, clip) =>
                    total + clip.duration,
                0
            );


        const clipPlan = {

            targetDuration,

            actualDuration:
                Number(
                    actualDuration.toFixed(3)
                ),

            durationDifference:
                Number(
                    (
                        actualDuration -
                        targetDuration
                    ).toFixed(3)
                ),

            clipCount:
                clips.length,

            clips

        };


        /*
         * --------------------------------------------------
         * 10. Final validation
         * --------------------------------------------------
         */

        this.validateClipPlan(
            clipPlan
        );


        /*
         * --------------------------------------------------
         * 11. Save
         * --------------------------------------------------
         */

        const outputPath =
            path.join(
                paths.metadata,
                "clip_plan.json"
            );


        await fs.promises.writeFile(

            outputPath,

            JSON.stringify(
                clipPlan,
                null,
                2
            ),

            "utf-8"

        );


        console.log(
            "\n========================================"
        );

        console.log(
            "[ShotMapper] CLIP PLAN CREATED"
        );

        console.log(
            "========================================"
        );

        console.log({
            targetDuration,
            actualDuration,
            clipCount: clips.length,
            outputPath
        });


        return clipPlan;

    }


    /*
     * ==================================================
     * FIND BEST SHOTS
     * ==================================================
     */

    async findBestShotsForBeat(
        beat,
        chunk,
        paths
    ) {

        /*
         * Priority #1:
         * Transcript
         */

        const transcriptShots =
            this.findShotsByTranscript(
                beat,
                chunk
            );


        if (
            transcriptShots &&
            transcriptShots.length
        ) {

            console.log(
                `[ShotMapper] ${beat.id} matched through transcript.`
            );


            return {

                shots:
                    this.expandShots(
                        transcriptShots,
                        chunk,
                        beat
                    ),

                source:
                    "transcript"

            };

        }


        /*
         * Priority #2:
         * Vision analysis
         */

        const visionShots =
            await this.findShotsByVision(
                beat,
                chunk,
                paths
            );


        if (
            visionShots &&
            visionShots.length
        ) {

            console.log(
                `[ShotMapper] ${beat.id} matched through vision analysis.`
            );


            return {

                shots:
                    this.expandShots(
                        visionShots,
                        chunk,
                        beat
                    ),

                source:
                    "vision"

            };

        }


        /*
         * Priority #3:
         * Shot-level metadata
         */

        const metadataShots =
            this.findShotsByMetadata(
                beat,
                chunk
            );


        if (
            metadataShots &&
            metadataShots.length
        ) {

            console.log(
                `[ShotMapper] ${beat.id} matched through shot metadata.`
            );


            return {

                shots:
                    this.expandShots(
                        metadataShots,
                        chunk,
                        beat
                    ),

                source:
                    "shot-metadata"

            };

        }


        /*
         * Last resort:
         * midpoint
         */

        console.log(
            `[ShotMapper] ${beat.id} using midpoint fallback.`
        );


        return {

            shots:
                this.selectShotsByMidpoint(
                    beat,
                    chunk
                ),

            source:
                "midpoint"

        };

    }


    /*
     * ==================================================
     * TRANSCRIPT MATCHING
     * ==================================================
     */

    findShotsByTranscript(
        beat,
        chunk
    ) {

        if (
            !Array.isArray(chunk.transcript) ||
            !chunk.transcript.length
        ) {

            return null;

        }


        const beatWords =
            this.getMeaningfulWords(
                beat.description
            );


        if (!beatWords.size) {
            return null;
        }


        const scored = [];


        for (
            const entry of chunk.transcript
        ) {

            const text =
                String(
                    entry.text || ""
                );


            if (!text.trim()) {
                continue;
            }


            const transcriptWords =
                this.getMeaningfulWords(
                    text
                );


            const score =
                this.calculateWordOverlap(
                    beatWords,
                    transcriptWords
                );


            if (score > 0) {

                const start =
                    this.getTranscriptStart(
                        entry
                    );


                const end =
                    this.getTranscriptEnd(
                        entry
                    );


                if (
                    start !== null
                ) {

                    scored.push({

                        entry,

                        start,

                        end:
                            end !== null
                                ? end
                                : start,

                        score

                    });

                }

            }

        }


        if (!scored.length) {
            return null;
        }


        scored.sort(
            (a, b) =>
                b.score - a.score
        );


        const best =
            scored[0];


        /*
         * We only trust a transcript match
         * if there is meaningful overlap.
         */

        if (best.score < 0.15) {
            return null;
        }


        return chunk.shots.filter(
            shot => {

                const shotStart =
                    Number(shot.start);

                const shotEnd =
                    Number(shot.end);


                return (
                    shotEnd >= best.start &&
                    shotStart <= best.end + 2
                );

            }
        );

    }


    /*
     * ==================================================
     * VISION MATCHING
     * ==================================================
     */

    async findShotsByVision(
        beat,
        chunk,
        paths
    ) {

        /*
         * We need contact sheet information
         * to know where the analyzed text belongs
         * in the movie.
         */

        if (
            !Array.isArray(chunk.contactSheets) ||
            !chunk.contactSheets.length
        ) {

            return null;

        }


        const visualDirectory =
            path.join(
                paths.visualAnalysis,
                chunk.id.toLowerCase()
            );


        if (
            !fs.existsSync(
                visualDirectory
            )
        ) {

            return null;

        }


        const beatWords =
            this.getMeaningfulWords(
                beat.description
            );


        if (!beatWords.size) {
            return null;
        }


        const analyses = [];


        for (
            const sheet of chunk.contactSheets
        ) {

            const sheetId =
                String(
                    sheet.id
                );


            const textPath =
                path.join(
                    visualDirectory,
                    `${sheetId.toLowerCase()}.txt`
                );


            if (
                !fs.existsSync(textPath)
            ) {

                continue;

            }


            const text =
                await fs.promises.readFile(
                    textPath,
                    "utf-8"
                );


            const words =
                this.getMeaningfulWords(
                    text
                );


            const score =
                this.calculateWordOverlap(
                    beatWords,
                    words
                );


            const start =
                this.getContactSheetStart(
                    sheet
                );


            const end =
                this.getContactSheetEnd(
                    sheet
                );


            /*
             * If the contact sheet doesn't have
             * timing metadata, we cannot safely
             * map the vision analysis to a timestamp.
             */

            if (
                start === null ||
                end === null
            ) {

                continue;

            }


            analyses.push({

                sheet,

                text,

                start,

                end,

                score

            });

        }


        if (!analyses.length) {
            return null;
        }


        analyses.sort(
            (a, b) =>
                b.score - a.score
        );


        const best =
            analyses[0];


        if (best.score < 0.10) {
            return null;
        }


        return chunk.shots.filter(
            shot => {

                return (
                    shot.end >= best.start &&
                    shot.start <= best.end
                );

            }
        );

    }


    /*
     * ==================================================
     * SHOT METADATA MATCHING
     * ==================================================
     */

    findShotsByMetadata(
        beat,
        chunk
    ) {

        const shots =
            Array.isArray(chunk.shots)
                ? chunk.shots
                : [];


        if (!shots.length) {
            return null;
        }


        /*
         * Some future shot detector may include
         * descriptions/tags/labels.
         *
         * This makes the mapper immediately
         * compatible with that structure.
         */

        const beatWords =
            this.getMeaningfulWords(
                beat.description
            );


        const scored =
            shots.map(
                shot => {

                    const searchable =
                        [
                            shot.description,
                            shot.label,
                            shot.caption,
                            shot.action,
                            shot.scene,
                            shot.location
                        ]
                            .filter(Boolean)
                            .join(" ");


                    const words =
                        this.getMeaningfulWords(
                            searchable
                        );


                    return {

                        shot,

                        score:
                            this.calculateWordOverlap(
                                beatWords,
                                words
                            )

                    };

                }
            );


        scored.sort(
            (a, b) =>
                b.score - a.score
        );


        if (
            !scored.length ||
            scored[0].score < 0.20
        ) {

            return null;

        }


        return [
            scored[0].shot
        ];

    }


    /*
     * ==================================================
     * MIDPOINT FALLBACK
     * ==================================================
     */

    selectShotsByMidpoint(
        beat,
        chunk
    ) {

        const shots =
            [...chunk.shots]
                .sort(
                    (a, b) =>
                        a.start - b.start
                );


        if (!shots.length) {
            return [];
        }


        let chunkStart = 0;
        let chunkEnd = 0;


        if (
            chunk.timeline
        ) {

            chunkStart =
                Number(
                    chunk.timeline.start
                ) || 0;


            chunkEnd =
                chunkStart +
                (
                    Number(
                        chunk.timeline.duration
                    ) || 0
                );

        } else {

            chunkStart =
                Number(
                    shots[0].start
                ) || 0;


            chunkEnd =
                Number(
                    shots[shots.length - 1].end
                ) || 0;

        }


        const midpoint =
            chunkStart +
            (
                chunkEnd -
                chunkStart
            ) / 2;


        let bestShot =
            shots[0];


        let bestDistance =
            Infinity;


        for (
            const shot of shots
        ) {

            const shotMid =
                (
                    Number(shot.start) +
                    Number(shot.end)
                ) / 2;


            const distance =
                Math.abs(
                    shotMid -
                    midpoint
                );


            if (
                distance < bestDistance
            ) {

                bestDistance =
                    distance;

                bestShot =
                    shot;

            }

        }


        return [
            bestShot
        ];

    }


    /*
     * ==================================================
     * EXPAND AROUND MATCH
     * ==================================================
     */

    expandShots(
        matchedShots,
        chunk,
        beat
    ) {

        if (
            !matchedShots.length
        ) {

            return [];

        }


        const allShots =
            [...chunk.shots]
                .sort(
                    (a, b) =>
                        a.start - b.start
                );


        const targets = {

            short: 8,

            medium: 15,

            long: 25

        };


        const target =
            targets[
            beat.suggestedDuration
            ] || 15;


        /*
         * Find matched shots in original array.
         */

        const indexes =
            matchedShots
                .map(
                    shot =>
                        allShots.findIndex(
                            s =>
                                s.id === shot.id
                        )
                )
                .filter(
                    index =>
                        index >= 0
                );


        if (!indexes.length) {
            return [];
        }


        let left =
            Math.min(...indexes);


        let right =
            Math.max(...indexes);


        let duration =
            this.calculateShotRangeDuration(
                allShots,
                left,
                right
            );


        /*
         * Expand around the matched region,
         * but stay inside this chunk.
         */

        while (
            duration < target &&
            (
                left > 0 ||
                right < allShots.length - 1
            )
        ) {

            const leftCandidate =
                left > 0
                    ? allShots[left - 1]
                    : null;


            const rightCandidate =
                right < allShots.length - 1
                    ? allShots[right + 1]
                    : null;


            const leftDuration =
                leftCandidate
                    ? Number(
                        leftCandidate.duration
                    ) || 0
                    : Infinity;


            const rightDuration =
                rightCandidate
                    ? Number(
                        rightCandidate.duration
                    ) || 0
                    : Infinity;


            if (
                leftDuration <= rightDuration &&
                leftCandidate
            ) {

                left--;

            } else if (
                rightCandidate
            ) {

                right++;

            } else {

                break;

            }


            duration =
                this.calculateShotRangeDuration(
                    allShots,
                    left,
                    right
                );

        }


        return allShots.slice(
            left,
            right + 1
        );

    }


    /*
     * ==================================================
     * BUDGET
     * ==================================================
     */

    enforceBudget(
        candidates,
        budget
    ) {

        /*
         * Important:
         *
         * We don't want importance sorting to
         * completely destroy narrative structure.
         *
         * First priority = importance.
         * Second priority = narrative order.
         */

        const sorted =
            [...candidates].sort(
                (a, b) => {

                    const importanceA =
                        Number(
                            a.beat.importance
                        ) || 0;


                    const importanceB =
                        Number(
                            b.beat.importance
                        ) || 0;


                    if (
                        importanceA !==
                        importanceB
                    ) {

                        return (
                            importanceB -
                            importanceA
                        );

                    }


                    return (
                        a.beat.order -
                        b.beat.order
                    );

                }
            );


        const selected = [];

        let total = 0;


        for (
            const candidate of sorted
        ) {

            if (
                total +
                candidate.duration
                <= budget
            ) {

                selected.push(
                    candidate
                );

                total +=
                    candidate.duration;

                continue;

            }


            /*
             * Try reducing candidate
             * by removing shots from the end.
             */

            const trimmed =
                this.trimCandidateToBudget(
                    candidate,
                    budget - total
                );


            if (
                trimmed
            ) {

                selected.push(
                    trimmed
                );

                total +=
                    trimmed.duration;

            }

        }


        console.log(
            `[ShotMapper] Budget selected duration: ${total.toFixed(2)}s / ${budget}s`
        );


        return selected;

    }


    trimCandidateToBudget(
        candidate,
        remainingBudget
    ) {

        const shots =
            [...candidate.shots];


        while (
            shots.length > 0
        ) {

            const start =
                shots[0].start;


            const end =
                shots[shots.length - 1].end;


            const duration =
                end - start;


            if (
                duration <=
                remainingBudget
            ) {

                return {

                    ...candidate,

                    shots,

                    start,

                    end,

                    duration

                };

            }


            /*
             * Remove from the end first.
             */

            if (
                shots.length === 1
            ) {

                return null;

            }


            shots.pop();

        }


        return null;

    }


    /*
     * ==================================================
     * OVERLAP RESOLUTION
     * ==================================================
     */

    resolveOverlaps(
        clips
    ) {

        /*
         * Work in narrative order.
         */

        const ordered =
            [...clips].sort(
                (a, b) =>
                    a.beat.order -
                    b.beat.order
            );


        const result = [];


        for (
            const clip of ordered
        ) {

            const overlaps =
                result.some(
                    existing =>
                        clip.start <
                        existing.end &&
                        clip.end >
                        existing.start
                );


            if (!overlaps) {

                result.push(
                    clip
                );

                continue;

            }


            /*
             * If the overlap is tiny, we can
             * simply drop the conflicting clip.
             *
             * We don't want to create invalid
             * shot boundaries by cutting arbitrary
             * seconds ourselves.
             */

            console.log(
                `[ShotMapper] Dropping overlapping clip: ${clip.beat.id}`
            );

        }


        return result;

    }


    /*
     * ==================================================
     * DEDUPLICATION
     * ==================================================
     */

    deduplicateBeats(
        beats
    ) {

        const seen =
            new Map();


        const unique = [];


        for (
            const beat of beats
        ) {

            if (
                !beat.chunkId ||
                !beat.description
            ) {

                continue;

            }


            const chunkId =
                beat.chunkId.toLowerCase();


            if (
                !seen.has(chunkId)
            ) {

                seen.set(
                    chunkId,
                    []
                );

            }


            const words =
                this.getMeaningfulWords(
                    beat.description
                );


            const existing =
                seen.get(chunkId);


            const duplicate =
                existing.some(
                    existingWords => {

                        const score =
                            this.calculateWordOverlap(
                                words,
                                existingWords
                            );


                        return score >= 0.65;

                    }
                );


            if (
                duplicate
            ) {

                console.log(
                    `[ShotMapper] Duplicate beat skipped: ${beat.id}`
                );

                continue;

            }


            existing.push(words);

            unique.push(beat);

        }


        return unique;

    }


    /*
     * ==================================================
     * HELPERS
     * ==================================================
     */

    getMeaningfulWords(
        text
    ) {

        const stopWords =
            new Set([
                "the",
                "a",
                "an",
                "and",
                "or",
                "is",
                "are",
                "was",
                "were",
                "to",
                "of",
                "in",
                "on",
                "at",
                "with",
                "for",
                "from",
                "this",
                "that",
                "then",
                "he",
                "she",
                "they",
                "it",
                "his",
                "her",
                "their"
            ]);


        return new Set(

            String(text || "")
                .toLowerCase()
                .replace(
                    /[^a-z0-9\s]/g,
                    " "
                )
                .split(/\s+/)
                .filter(
                    word =>
                        word.length > 2 &&
                        !stopWords.has(word)
                )

        );

    }


    calculateWordOverlap(
        a,
        b
    ) {

        if (
            !a.size ||
            !b.size
        ) {

            return 0;

        }


        let intersection = 0;


        for (
            const word of a
        ) {

            if (
                b.has(word)
            ) {

                intersection++;

            }

        }


        /*
         * We measure against the beat words.
         *
         * If 5 out of 10 important beat words
         * occur in the candidate text => 0.5
         */

        return (
            intersection /
            a.size
        );

    }


    calculateShotRangeDuration(
        shots,
        left,
        right
    ) {

        if (
            left > right ||
            !shots[left] ||
            !shots[right]
        ) {

            return 0;

        }


        return (
            Number(shots[right].end) -
            Number(shots[left].start)
        );

    }


    ensureChronologicalShots(
        shots
    ) {

        return [...shots]
            .filter(
                shot =>
                    Number.isFinite(
                        Number(shot.start)
                    ) &&
                    Number.isFinite(
                        Number(shot.end)
                    )
            )
            .sort(
                (a, b) =>
                    Number(a.start) -
                    Number(b.start)
            );

    }


    getTranscriptStart(
        entry
    ) {

        if (
            entry.offsets
        ) {

            if (
                Number.isFinite(
                    Number(
                        entry.offsets.from
                    )
                )
            ) {

                return (
                    Number(
                        entry.offsets.from
                    ) / 1000
                );

            }

        }


        if (
            Number.isFinite(
                Number(entry.start)
            )
        ) {

            return Number(
                entry.start
            );

        }


        return null;

    }


    getTranscriptEnd(
        entry
    ) {

        if (
            entry.offsets
        ) {

            if (
                Number.isFinite(
                    Number(
                        entry.offsets.to
                    )
                )
            ) {

                return (
                    Number(
                        entry.offsets.to
                    ) / 1000
                );

            }

        }


        if (
            Number.isFinite(
                Number(entry.end)
            )
        ) {

            return Number(
                entry.end
            );

        }


        return null;

    }


    getContactSheetStart(
        sheet
    ) {

        const value =
            sheet.start ??
            sheet.startTime ??
            sheet.timeline?.start;


        if (
            Number.isFinite(
                Number(value)
            )
        ) {

            return Number(value);

        }


        return null;

    }


    getContactSheetEnd(
        sheet
    ) {

        const value =
            sheet.end ??
            sheet.endTime ??
            (
                sheet.timeline
                    ? (
                        Number(sheet.timeline.start) +
                        Number(sheet.timeline.duration)
                    )
                    : null
            );


        if (
            Number.isFinite(
                Number(value)
            )
        ) {

            return Number(value);

        }


        return null;

    }


    validateClipPlan(
        clipPlan
    ) {

        const clips =
            clipPlan.clips;


        if (
            !Array.isArray(clips)
        ) {

            throw new Error(
                "Clip plan does not contain clips."
            );

        }


        for (
            const clip of clips
        ) {

            const duration =
                clip.end -
                clip.start;


            /*
             * Don't allow absurd clips.
             */

            if (
                duration < 3 ||
                duration > 40
            ) {

                console.warn(
                    `[ShotMapper] Clip ${clip.id} has duration ${duration.toFixed(2)}s`
                );

            }


            if (
                clip.end <=
                clip.start
            ) {

                throw new Error(
                    `Invalid clip timing for ${clip.id}`
                );

            }


            if (
                !Array.isArray(clip.shots) ||
                !clip.shots.length
            ) {

                throw new Error(
                    `Clip ${clip.id} contains no shots.`
                );

            }

        }


        /*
         * Verify no overlaps.
         */

        const sorted =
            [...clips].sort(
                (a, b) =>
                    a.start - b.start
            );


        for (
            let i = 1;
            i < sorted.length;
            i++
        ) {

            if (
                sorted[i].start <
                sorted[i - 1].end
            ) {

                throw new Error(
                    `Clip overlap detected between ${sorted[i - 1].id} and ${sorted[i].id}`
                );

            }

        }


        /*
         * Budget validation.
         */

        const maxAllowed =
            clipPlan.targetDuration * 1.10;


        if (
            clipPlan.actualDuration >
            maxAllowed
        ) {

            throw new Error(
                `Clip plan exceeds 110% of target duration. Actual: ${clipPlan.actualDuration}s, Target: ${clipPlan.targetDuration}s`
            );

        }

    }

}


module.exports =
    new ShotMapperService();