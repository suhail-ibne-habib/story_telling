const fs = require("fs");
const path = require("path");
const axios = require("axios");

class GeminiService {

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
        this.eventModel = process.env.GEMINI_EVENT_MODEL || "gemini-3.5-flash";
        this.host = "https://generativelanguage.googleapis.com/v1beta";
        this.uploadHost = "https://generativelanguage.googleapis.com/upload/v1beta";
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

    headers(extra = {}) {
        return {
            "x-goog-api-key": this.apiKey,
            ...extra
        };
    }

    getMimeType(filePath) {
        const extension = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            ".mp4": "video/mp4",
            ".webm": "video/webm",
            ".mov": "video/quicktime",
            ".mkv": "video/x-matroska",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png"
        };

        return mimeTypes[extension] || "application/octet-stream";
    }

    async uploadFile(filePath) {
        this.assertKey();

        const stats = await fs.promises.stat(filePath);
        const mimeType = this.getMimeType(filePath);
        const displayName = path.basename(filePath);

        console.log(
            `[Gemini] Starting upload: ${displayName} (${(stats.size / (1024 * 1024)).toFixed(1)} MB)`
        );

        try {
            const start = await axios.post(
                `${this.uploadHost}/files`,
                {
                    file: {
                        displayName
                    }
                },
                {
                    headers: this.headers({
                        "Content-Type": "application/json",
                        "X-Goog-Upload-Protocol": "resumable",
                        "X-Goog-Upload-Command": "start",
                        "X-Goog-Upload-Header-Content-Length": String(stats.size),
                        "X-Goog-Upload-Header-Content-Type": mimeType
                    }),
                    timeout: 120000
                }
            );

            const uploadUrl =
                start.headers["x-goog-upload-url"] ||
                start.headers["X-Goog-Upload-URL"];

            if (!uploadUrl) {
                throw new Error("Gemini did not return an upload URL.");
            }

            const uploaded = await axios.put(
                uploadUrl,
                fs.createReadStream(filePath),
                {
                    headers: {
                        "Content-Length": String(stats.size),
                        "X-Goog-Upload-Offset": "0",
                        "X-Goog-Upload-Command": "upload, finalize"
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    timeout: 0
                }
            );

            const file = uploaded.data?.file || uploaded.data;

            if (!file?.name) {
                throw new Error("Gemini file upload returned no file name.");
            }

            return this.waitUntilActive(file);
        } catch (error) {
            if (error.message?.startsWith("Gemini ")) {
                throw error;
            }

            throw this.wrapError(error, "Gemini upload failed");
        }
    }

    async waitUntilActive(file) {
        let current = file;
        const started = Date.now();

        while (current.state && current.state !== "ACTIVE") {
            if (current.state === "FAILED") {
                throw new Error("Gemini file processing failed.");
            }

            if (Date.now() - started > 1000 * 60 * 20) {
                throw new Error("Timed out waiting for Gemini to process the video.");
            }

            console.log(
                `[Gemini] File state: ${current.state}`
            );

            await new Promise((resolve) => setTimeout(resolve, 4000));

            const response = await axios.get(
                `${this.host}/${current.name}`,
                {
                    headers: this.headers(),
                    timeout: 60000
                }
            );

            current = response.data;
        }

        console.log(
            `[Gemini] File ready: ${current.uri || current.name}`
        );

        return current;
    }

    async deleteFile(file) {
        if (!file?.name) {
            return;
        }

        try {
            await axios.delete(
                `${this.host}/${file.name}`,
                {
                    headers: this.headers(),
                    timeout: 30000
                }
            );
        } catch (error) {
            console.log(
                `[Gemini] Could not delete uploaded file: ${error.message}`
            );
        }
    }

    async generateJson({
        file,
        images,
        user,
        system,
        timeoutMs,
        model,
        disableThinking
    }) {
        this.assertKey();

        const modelId = model || this.model;
        const parts = [];

        if (file?.uri) {
            parts.push({
                fileData: {
                    mimeType: file.mimeType || "video/mp4",
                    fileUri: file.uri
                }
            });
        }

        if (Array.isArray(images)) {
            for (const image of images) {
                if (image.label) {
                    parts.push({
                        text: String(image.label)
                    });
                }

                const buffer = image.buffer
                    ? image.buffer
                    : await fs.promises.readFile(image.path);

                parts.push({
                    inlineData: {
                        mimeType: image.mimeType || this.getMimeType(image.path) || "image/jpeg",
                        data: buffer.toString("base64")
                    }
                });
            }
        }

        parts.push({
            text: user
        });

        const generationConfig = {
            temperature: 0.1,
            responseMimeType: "application/json"
        };

        if (disableThinking) {
            generationConfig.thinkingConfig = {
                thinkingBudget: 0
            };
        }

        const payload = {
            contents: [
                {
                    role: "user",
                    parts
                }
            ],
            generationConfig
        };

        if (system && system.trim()) {
            payload.systemInstruction = {
                parts: [
                    {
                        text: system
                    }
                ]
            };
        }

        const started = Date.now();

        console.log(
            `[Gemini] generateContent model=${modelId}`
        );

        let response;

        try {
            response = await axios.post(
                `${this.host}/models/${modelId}:generateContent`,
                payload,
                {
                    headers: this.headers({
                        "Content-Type": "application/json"
                    }),
                    timeout: timeoutMs || 1000 * 60 * 30,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity
                }
            );
        } catch (error) {
            throw this.wrapError(error, "Gemini generateContent failed");
        }

        console.log(
            `[Gemini] Completed in ${((Date.now() - started) / 1000).toFixed(2)}s`
        );

        const text = this.extractText(response.data);

        if (!text) {
            throw new Error("Gemini returned an empty JSON response.");
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
