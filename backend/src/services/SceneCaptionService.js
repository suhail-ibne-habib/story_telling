const fs = require("fs");

const GeminiService = require("./GeminiService");
const { formatClockHms } = require("./TimeService");
const { parseJsonFromText } = require("../utils/jsonFile");

const BLOCKED_SUMMARY =
    "Visual caption unavailable (blocked by the vision filter, likely a violent scene).";

const MAX_PARSE_ATTEMPTS = 2;

function describePrompt({ startSec, endSec, tiles }) {
    return [
        `This contact sheet shows ${tiles.length} frames from ONE movie scene (${formatClockHms(startSec * 1000)} to ${formatClockHms(endSec * 1000)}), left to right, top to bottom, in time order.`,
        'Each frame has a label "#<tile> <time>" in its top-left corner.',
        "",
        "Return JSON:",
        "{",
        '  "summary": "one sentence, max 30 words: where this is, who is there, what happens overall",',
        '  "moments": [ { "tile": 1, "shows": "max 15 words", "text_only": false } ]',
        "}",
        "",
        "Rules:",
        `- "moments" has exactly one entry per tile, tiles 1 to ${tiles.length}.`,
        "- \"shows\" describes only what is visible in THAT frame: people by appearance (age, clothes, hair, bare feet only if you see them), what they hold, what they do, the setting.",
        "- If a frame is mostly text, a logo, credits or black, set \"text_only\": true and write the text in \"shows\" (e.g. \"credits text: Directed by ...\"). Do not invent people for these frames.",
        "- No character names, no plot guesses. If you are not sure about a detail, leave it out."
    ].join("\n");
}

function clean(text, limit) {
    return String(text || "")
        .replace(/\s+/g, " ")
        .replace(/^["'\s]+|["'\s]+$/g, "")
        .trim()
        .slice(0, limit);
}

function normalize(parsed, tiles) {
    const byTile = new Map(
        (Array.isArray(parsed?.moments) ? parsed.moments : [])
            .map((moment) => [Number(moment?.tile), moment])
    );

    const moments = tiles.map((tile) => {
        const found = byTile.get(tile.tile);

        return {
            tile: tile.tile,
            shows: clean(found?.shows, 160),
            text_only: Boolean(found?.text_only)
        };
    });

    const summary = clean(parsed?.summary, 300);

    if (!summary || moments.every((moment) => !moment.shows)) {
        throw new Error("Gemini returned an empty scene description");
    }

    return { summary, moments, blocked: false };
}

class SceneCaptionService {

    get concurrency() {
        const configured = Number(process.env.CAPTION_CONCURRENCY);
        return Number.isInteger(configured) && configured > 0 ? configured : 4;
    }

    get model() {
        return process.env.CAPTION_GEMINI_MODEL || GeminiService.model;
    }

    async describe({ imagePath, startSec, endSec, tiles }) {
        const imageBase64 = (await fs.promises.readFile(imagePath)).toString("base64");
        let lastError = null;

        for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt += 1) {
            try {
                const raw = await GeminiService.describeImages({
                    prompt: describePrompt({ startSec, endSec, tiles }),
                    images: [imageBase64],
                    model: this.model,
                    json: true,
                    maxOutputTokens: 3000
                });

                return normalize(parseJsonFromText(raw), tiles);
            } catch (error) {
                if (GeminiService.isBlocked(error)) {
                    return {
                        summary: BLOCKED_SUMMARY,
                        moments: tiles.map((tile) => ({ tile: tile.tile, shows: "", text_only: false })),
                        blocked: true
                    };
                }

                lastError = error;
            }
        }

        throw lastError;
    }
}

module.exports = new SceneCaptionService();
