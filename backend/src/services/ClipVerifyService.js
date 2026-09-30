const fs = require("fs");
const path = require("path");

const FFmpegService = require("./FFmpegService");
const GeminiService = require("./GeminiService");
const { parseJsonFromText } = require("../utils/jsonFile");

const FRAME_POSITIONS = [0.2, 0.5, 0.8];
const REPLY_ATTEMPTS = 2;

// Gemini sometimes leaves quotes unescaped inside "visible"; fall back to pulling the fields out by pattern.
function parseVerdict(raw) {
    try {
        return parseJsonFromText(raw);
    } catch {
        const text = String(raw || "");
        const score = text.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/);

        if (!score) {
            return null;
        }

        const field = (name) => (text.match(new RegExp(`"${name}"\\s*:\\s*"(.*?)"\\s*[,}]`, "s")) || [])[1] || "";

        return { score: Number(score[1]), visible: field("visible"), missing: field("missing") };
    }
}

function verifyPrompt(text, shows) {
    const target = shows || text;

    return [
        "These 3 frames are in time order from one movie clip. It is B-roll under a recap narrator.",
        `The editor wants the clip to show: "${target}"`,
        ...(shows ? [`(Narration over it, for context only: "${text}". It may talk about feelings or backstory; don't judge the narration.)`] : []),
        "",
        "Judge only what is visible in the frames against what the editor wants. Score from 0 to 10:",
        "10 = clearly shows it: the right people doing the right thing",
        "7 = the right people in the right situation, even if a small detail is not visible",
        "4 = right people or place, but not the situation",
        "1 = only the mood or setting matches",
        "0 = unrelated, or contradicts it (wrong number of people, someone missing, different action)",
        "",
        "Return JSON:",
        '{"score": <0-10>, "visible": "<what the frames actually show, max 20 words>", "missing": "<what the editor wanted that is not visible, or empty>"}'
    ].join("\n");
}

class ClipVerifyService {

    get enabled() {
        return process.env.VERIFY_CLIPS !== "false";
    }

    get passScore() {
        const configured = Number(process.env.VERIFY_PASS_SCORE);
        return Number.isFinite(configured) ? configured : 7;
    }

    async score({ moviePath, window, text, shows, framesDir, name }) {
        await fs.promises.mkdir(framesDir, { recursive: true });

        const images = [];
        const frames = [];

        for (const [order, position] of FRAME_POSITIONS.entries()) {
            const framePath = path.join(framesDir, `${name}_${order + 1}.jpg`);

            await FFmpegService.extractFrame({
                inputPath: moviePath,
                atSec: window.start_sec + (window.end_sec - window.start_sec) * position,
                outputPath: framePath
            });

            frames.push(framePath);
            images.push((await fs.promises.readFile(framePath)).toString("base64"));
        }

        for (let attempt = 1; attempt <= REPLY_ATTEMPTS; attempt += 1) {
            let raw;

            try {
                raw = await GeminiService.describeImages({
                    prompt: verifyPrompt(text, shows),
                    images,
                    json: true,
                    model: process.env.VERIFY_GEMINI_MODEL || undefined
                });
            } catch (error) {
                if (!GeminiService.isBlocked(error)) {
                    throw error;
                }

                return {
                    score: null,
                    visible: "",
                    missing: "",
                    reason: "Vision check blocked by Gemini's filter (likely violent footage).",
                    blocked: true,
                    frames
                };
            }

            const parsed = parseVerdict(raw);

            if (parsed) {
                const score = Math.max(0, Math.min(10, Number(parsed.score)));
                const visible = String(parsed.visible || "").trim();
                const missing = String(parsed.missing || "").trim();

                return {
                    score: Number.isFinite(score) ? score : null,
                    visible,
                    missing,
                    reason: missing ? `${visible} Missing: ${missing}` : visible,
                    frames
                };
            }

            console.warn(
                `[Verify] ${name}: unreadable Gemini reply (attempt ${attempt}/${REPLY_ATTEMPTS})` +
                (attempt < REPLY_ATTEMPTS ? ", retrying." : ", skipping this candidate.")
            );
        }

        return {
            score: null,
            visible: "",
            missing: "",
            reason: "Vision check reply was unreadable.",
            frames
        };
    }
}

module.exports = new ClipVerifyService();
