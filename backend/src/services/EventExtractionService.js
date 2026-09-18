const EventExtractionPromptBuilderService = require("./EventExtractionPromptBuilderService");
const GeminiService = require("./GeminiService");
const { parseClock, formatClockHms, clampRange } = require("./TimeService");

const EVENT_PAD_MS = 500;

class EventExtractionService {

    buildRequest(durationSec) {
        return EventExtractionPromptBuilderService.build({
            durationSec
        });
    }

    parseResponse(raw) {
        if (!raw || typeof raw !== "string") {
            throw new Error("Gemini returned an empty event response.");
        }

        const stripped = raw
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        const start = stripped.indexOf("{");
        const end = stripped.lastIndexOf("}");

        if (start === -1 || end === -1 || end <= start) {
            throw new Error("Gemini did not return a JSON object.");
        }

        try {
            return JSON.parse(stripped.slice(start, end + 1));
        } catch (error) {
            throw new Error(
                `Gemini returned invalid JSON: ${error.message}`
            );
        }
    }

    normalize(parsed, durationSec) {
        const rows = Array.isArray(parsed?.full_recap)
            ? parsed.full_recap
            : [];

        if (rows.length === 0) {
            throw new Error("Gemini returned no full_recap events.");
        }

        const durationMs = Math.round((Number(durationSec) || 0) * 1000);
        const seen = new Set();

        const full_recap = rows.map((scene, index) => {
            const startMs = parseClock(scene.start_time ?? scene.start);
            const endMs = parseClock(scene.end_time ?? scene.end);
            const sceneId = Number(scene.scene_id) || index + 1;
            const id = `R${String(sceneId).padStart(3, "0")}`;
            const narration = String(scene.narration_script || "").trim();
            const visual = String(scene.visual_description || "").trim();
            const storyArc = String(scene.story_arc || "").trim();

            if (startMs == null || endMs == null) {
                console.log(
                    `[EventExtraction] Skipping ${id}: missing start_time/end_time.`
                );
                return null;
            }

            if (!narration) {
                console.log(
                    `[EventExtraction] Skipping ${id}: missing narration_script.`
                );
                return null;
            }

            const times = clampRange(startMs, endMs, durationMs, EVENT_PAD_MS);

            if (times.durationMs < 500) {
                console.log(
                    `[EventExtraction] Skipping ${id}: zero-length window ${scene.start_time} → ${scene.end_time}.`
                );
                return null;
            }

            const rangeKey = `${times.startMs}:${times.endMs}`;

            if (seen.has(rangeKey)) {
                console.log(
                    `[EventExtraction] Skipping ${id}: duplicate window ${formatClockHms(times.startMs)} → ${formatClockHms(times.endMs)}.`
                );
                return null;
            }

            seen.add(rangeKey);

            return {
                scene_id: sceneId,
                id,
                start_time: formatClockHms(times.startMs),
                end_time: formatClockHms(times.endMs),
                story_arc: storyArc,
                narration_script: narration,
                visual_description: visual,
                start: formatClockHms(times.startMs),
                end: formatClockHms(times.endMs),
                startMs: times.startMs,
                endMs: times.endMs,
                durationMs: times.durationMs,
                title: storyArc || `Event ${sceneId}`,
                storyText: narration
            };
        }).filter(Boolean).sort((a, b) => a.startMs - b.startMs);

        if (full_recap.length === 0) {
            throw new Error("Gemini returned no usable recap events.");
        }

        const recapDurationMs = full_recap.reduce(
            (sum, scene) => sum + scene.durationMs,
            0
        );

        return {
            source: "gemini_video",
            full_recap,
            recap: full_recap,
            events: full_recap,
            recapDurationMs,
            recapDurationSeconds: Math.round(recapDurationMs / 1000)
        };
    }

    toPublicManifest(result) {
        return {
            full_recap: result.full_recap.map((scene) => ({
                scene_id: scene.scene_id,
                start_time: scene.start_time,
                end_time: scene.end_time,
                story_arc: scene.story_arc,
                narration_script: scene.narration_script,
                visual_description: scene.visual_description
            }))
        };
    }

    async extract({
        proxyPath,
        durationSec
    }) {
        const request = this.buildRequest(durationSec);
        let file;

        try {
            file = await GeminiService.uploadFile(proxyPath);

            const raw = await GeminiService.generateJson({
                file,
                system: request.system,
                user: request.user,
                model: GeminiService.eventModel,
                timeoutMs: 1000 * 60 * 45
            });

            const parsed = this.parseResponse(raw);
            const result = this.normalize(parsed, durationSec);

            return {
                request,
                raw,
                parsed,
                result
            };
        } finally {
            await GeminiService.deleteFile(file);
        }
    }

}

module.exports = new EventExtractionService();
