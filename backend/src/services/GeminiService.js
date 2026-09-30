const axios = require("axios");

const SAFETY_CATEGORIES = [
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_DANGEROUS_CONTENT"
];

const BLOCK_REASONS = /PROHIBITED_CONTENT|SAFETY|BLOCKLIST|IMAGE_SAFETY/i;

class GeminiService {

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
        this.host = "https://generativelanguage.googleapis.com/v1beta";
    }

    assertKey() {
        if (!this.apiKey) {
            throw new Error("GEMINI_API_KEY is not configured.");
        }
    }

    wrapError(error, fallback) {
        const status = error?.response?.status;
        const apiMessage =
            error?.response?.data?.error?.message ||
            error?.response?.data?.message ||
            error.message;

        if (status) {
            return new Error(`Gemini ${status}: ${apiMessage}`);
        }

        return new Error(`${fallback}: ${apiMessage}`);
    }

    isBlocked(error) {
        return Boolean(error?.blocked);
    }

    async describeImages({
        prompt,
        images,
        mimeType = "image/jpeg",
        model,
        json = false,
        temperature = 0.2,
        maxOutputTokens = 300,
        timeoutMs = 1000 * 60
    }) {
        this.assertKey();

        const modelId = model || this.model;
        const payload = {
            contents: [
                {
                    role: "user",
                    parts: [
                        ...images.map((data) => ({ inlineData: { mimeType, data } })),
                        { text: prompt }
                    ]
                }
            ],
            generationConfig: {
                temperature,
                maxOutputTokens,
                ...(json ? { responseMimeType: "application/json" } : {})
            },
            safetySettings: SAFETY_CATEGORIES.map((category) => ({
                category,
                threshold: "BLOCK_NONE"
            }))
        };

        let response;

        try {
            response = await axios.post(
                `${this.host}/models/${modelId}:generateContent`,
                payload,
                {
                    headers: {
                        "x-goog-api-key": this.apiKey,
                        "Content-Type": "application/json"
                    },
                    timeout: timeoutMs
                }
            );
        } catch (error) {
            throw this.wrapError(error, "Gemini request failed");
        }

        const text = this.extractText(response.data);

        if (!text) {
            const reason =
                response.data?.promptFeedback?.blockReason ||
                response.data?.candidates?.[0]?.finishReason ||
                "unknown";
            const error = new Error(`Gemini returned no text (reason: ${reason})`);
            error.blocked = BLOCK_REASONS.test(reason);
            throw error;
        }

        return text;
    }

    extractText(data) {
        const parts = data?.candidates?.[0]?.content?.parts;

        if (!Array.isArray(parts)) {
            return "";
        }

        return parts
            .map((part) => part.text)
            .filter(Boolean)
            .join("\n")
            .trim();
    }
}

module.exports = new GeminiService();
