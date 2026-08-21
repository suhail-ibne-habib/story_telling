const EventBus = require("../core/EventBus");
const events = require("../events/events");
const Storage = require("../../storage/StorageService");
const ProgressService = require("../services/ProgressService");
const ShotMappingService = require("../services/ShotMappingService");
const STAGES = require("../constance/pipelineStages");
const path = require("path");
const fs = require("fs");

EventBus.subscribe(events.STORY_BEAT_PLANNING_COMPLETED, async ({ jobId }) => {
    try {
        console.log("\n========================================");
        console.log("Shot Mapping Worker is running...");
        console.log("========================================\n");

        await ProgressService.startStage(jobId, STAGES.SHOT_MAPPING);
        const paths = Storage.getPaths(jobId);

        // Load story beats
        const storyBeatsPath = path.join(paths.metadata, "story_beats.json");
        const storyBeatsRaw = await fs.promises.readFile(storyBeatsPath, "utf-8");
        const storyBeatData = JSON.parse(storyBeatsRaw);
        const beats = storyBeatData.beats || [];

        if (!beats.length) {
            throw new Error("No story beats were found.");
        }

        console.log(`[ShotMapping] Found ${beats.length} story beats. Target duration: ${storyBeatData.targetDuration || "unknown"}s`);

        const outputDirectory = paths.shotMapping;
        if (!outputDirectory) {
            throw new Error("Storage paths.shotMapping is not configured.");
        }
        await fs.promises.mkdir(outputDirectory, { recursive: true });

        const results = [];

        for (const beat of beats) {
            console.log(`\n[ShotMapping] Processing ${beat.id}`);

            const chunkIds = Array.isArray(beat.chunkIds) ? beat.chunkIds : [];
            if (!chunkIds.length) {
                console.warn(`[ShotMapping] ${beat.id} has no chunkIds. Skipping.`);
                continue;
            }

            console.log(`[ShotMapping] ${beat.id} uses chunks: ${chunkIds.join(", ")}`);

            const chunkContexts = [];

            for (const chunkId of chunkIds) {
                console.log(`[ShotMapping] Loading ${chunkId}`);

                // Load chunk (shots, transcript, timeline)
                const chunkPath = path.join(paths.chunks, `${chunkId}.json`);
                const chunkRaw = await fs.promises.readFile(chunkPath, "utf-8");
                const chunk = JSON.parse(chunkRaw);

                // Load visual analysis (array of {timestamp, description})
                const analysisPath = path.join(paths.chunkAnalysis, `${chunkId}.json`);
                let analysisEntries = [];
                try {
                    const analysisRaw = await fs.promises.readFile(analysisPath, "utf-8");
                    const parsed = JSON.parse(analysisRaw);
                    analysisEntries = Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    console.warn(`[ShotMapping] No analysis found for ${chunkId}, proceeding without visual context.`);
                }

                // Build lookup: timestamp (in seconds) -> description
                const analysisByTimestamp = new Map();
                for (const entry of analysisEntries) {
                    const seconds = parseTimestamp(entry.timestamp);
                    if (!isNaN(seconds)) {
                        analysisByTimestamp.set(seconds, entry.description);
                    }
                }

                // Build shot-level contexts with merged visual descriptions and transcript
                const shotContexts = (chunk.shots || []).map((shot) => {
                    // Match visual analysis to frames in this shot
                    const visualDescriptions = (shot.frames || [])
                        .map((frame) => {
                            const desc = analysisByTimestamp.get(frame.timestamp);
                            return desc
                                ? {
                                    timestamp: frame.timestamp,
                                    description: desc,
                                }
                                : null;
                        })
                        .filter(Boolean);

                    // Match transcript segments overlapping this shot
                    const shotTranscript = (chunk.transcript || []).filter((t) => {
                        const tStart = t.offsets.from / 1000;
                        const tEnd = t.offsets.to / 1000;
                        return tStart < shot.end && tEnd > shot.start;
                    }).map((t) => ({
                        from: parseFloat((t.offsets.from / 1000).toFixed(3)),
                        to: parseFloat((t.offsets.to / 1000).toFixed(3)),
                        text: t.text.trim(),
                    }));

                    return {
                        shotId: shot.id,
                        start: parseFloat(shot.start.toFixed(3)),
                        end: parseFloat(shot.end.toFixed(3)),
                        duration: parseFloat(shot.duration.toFixed(3)),
                        visualDescriptions,
                        transcript: shotTranscript,
                    };
                });

                chunkContexts.push({
                    chunkId: chunk.id,
                    timeline: chunk.timeline,
                    shots: shotContexts,
                });

                console.log(`[ShotMapping] ${chunkId} context prepared with ${shotContexts.length} shots.`);
            }

            console.log(`[ShotMapping] Prepared ${chunkContexts.length} chunk contexts.`);

            // Call service
            const mapping = await ShotMappingService.mapBeat({ beat, chunkContexts });

            // Save individual beat mapping
            const outputPath = path.join(outputDirectory, `${beat.id}.json`);
            await fs.promises.writeFile(outputPath, JSON.stringify(mapping, null, 2), "utf-8");

            results.push(mapping);

            if (mapping.cut) {
                console.log(`[ShotMapping] ${beat.id} completed. Mapped ${mapping.cut.duration}s.`);
            } else {
                console.warn(`[ShotMapping] ${beat.id} completed with no shots selected.`);
            }
        }

        // Save combined mapping
        const combinedOutputPath = path.join(outputDirectory, "shot_mapping.json");
        const totalDuration = results.reduce((sum, r) => sum + (r.cut?.duration || 0), 0);

        await fs.promises.writeFile(
            combinedOutputPath,
            JSON.stringify({ jobId, totalDuration, beats: results }, null, 2),
            "utf-8"
        );

        console.log(`\n[ShotMapping] Total mapped duration: ${totalDuration.toFixed(1)}s`);

        await ProgressService.completeStage(jobId, STAGES.SHOT_MAPPING);

        console.log("\n========================================");
        console.log("Shot Mapping Completed");
        console.log("========================================\n");

        EventBus.publish(events.SHOT_MAPPING_COMPLETED, { jobId });
    } catch (error) {
        console.error("\n========================================");
        console.error("SHOT MAPPING WORKER FAILED");
        console.error("Job ID:", jobId);
        console.error("Error:", error.message);
        console.error(error.stack);
        console.error("========================================\n");

        await ProgressService.failStage(jobId, STAGES.SHOT_MAPPING, error.message);
        EventBus.publish(events.SHOT_MAPPING_FAILED, { jobId, error: error.message });
    }
});

// Helpers
function parseTimestamp(ts) {
    // Handles "MM:SS.mmm" or "HH:MM:SS.mmm"
    const parts = ts.split(":").map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return NaN;
}