const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

class GeminiService {

    constructor() {

        this.apiKey =
            process.env.GEMINI_API_KEY;

        this.model =
            process.env.GEMINI_MODEL ||
            "gemini-3.6-flash";

        this.host =
            "https://generativelanguage.googleapis.com/v1beta";

        if (!this.apiKey) {

            throw new Error(
                "GEMINI_API_KEY is not configured."
            );

        }

    }


    /**
     * Generate a vision analysis response.
     *
     * Expected prompt:
     *
     * {
     *     system: "...",
     *     user: "...",
     *     images: [
     *         "D:/path/to/contact-sheet.jpg"
     *     ]
     * }
     */
    async generate(prompt) {

        const {
            system,
            user,
            images = []
        } = prompt;


        if (!user) {

            throw new Error(
                "Gemini prompt requires a user message."
            );

        }


        console.log(
            "\n========== GEMINI REQUEST =========="
        );

        console.log(
            `[Gemini] Model: ${this.model}`
        );

        console.log(
            `[Gemini] Image count: ${images.length}`
        );

        console.log(
            `[Gemini] User prompt: ${Buffer.byteLength(
                user,
                "utf8"
            )} bytes`
        );


        try {

            /*
             * Build request payload
             */

            const payload =
                await this.buildPayload({
                    system,
                    user,
                    images
                });


            console.log(
                "[Gemini] Payload built."
            );


            const started =
                Date.now();


            const response =
                await axios.post(

                    `${this.host}/models/${this.model}:generateContent`,

                    payload,

                    {
                        headers: {

                            "Content-Type":
                                "application/json",

                            "x-goog-api-key":
                                this.apiKey

                        },

                        timeout:
                            1000 * 60 * 20,

                        maxBodyLength:
                            Infinity,

                        maxContentLength:
                            Infinity

                    }

                );


            const duration =
                (
                    (Date.now() - started) /
                    1000
                ).toFixed(2);


            console.log(
                `[Gemini] Completed in ${duration}s`
            );


            /*
             * Extract text response
             */

            const text =
                this.extractText(
                    response.data
                );


            if (!text) {

                throw new Error(
                    "Gemini returned an empty response."
                );

            }


            console.log(
                `[Gemini] Response length: ${text.length} characters`
            );


            console.log(
                "====================================\n"
            );


            return {

                content: text,

                raw: response.data

            };


        } catch (error) {

            console.error(
                "\n========== GEMINI ERROR =========="
            );


            if (error.response) {

                console.error(
                    "[Gemini] Status:",
                    error.response.status
                );

                console.error(
                    "[Gemini] Response:",
                    error.response.data
                );

            } else {

                console.error(
                    "[Gemini] Error:",
                    error.message
                );

            }


            console.error(
                "===================================\n"
            );


            throw error;

        }

    }


    /**
     * Build Gemini generateContent payload.
     */
    async buildPayload({
        system,
        user,
        images
    }) {

        /*
         * Text part
         */

        const parts = [];


        /*
         * Add user prompt first.
         */

        parts.push({

            text: user

        });


        /*
         * Add contact-sheet images.
         */

        for (
            const imagePath of images
        ) {

            const imagePart =
                await this.buildImagePart(
                    imagePath
                );


            parts.push(
                imagePart
            );

        }


        const payload = {

            contents: [

                {

                    role: "user",

                    parts

                }

            ],

            generationConfig: {

                temperature: 0.2,
                maxOutputTokens: 2048,
                responseMimeType: "application/json"

            }

        };


        /*
         * Gemini system instruction.
         */

        if (
            system &&
            system.trim()
        ) {

            payload.systemInstruction = {

                parts: [

                    {
                        text: system
                    }

                ]

            };

        }


        return payload;

    }


    /**
     * Convert local image into Gemini inlineData.
     */
    async buildImagePart(imagePath) {

        if (!imagePath) {

            throw new Error(
                "Image path is required."
            );

        }


        const absolutePath =
            path.resolve(
                imagePath
            );


        console.log(
            `[Gemini] Reading image: ${absolutePath}`
        );


        const imageBuffer =
            await fs.readFile(
                absolutePath
            );


        const base64 =
            imageBuffer.toString(
                "base64"
            );


        const mimeType =
            this.getMimeType(
                absolutePath
            );


        return {

            inlineData: {

                mimeType,

                data: base64

            }

        };

    }


    /**
     * Determine MIME type from image extension.
     */
    getMimeType(filePath) {

        const extension =
            path.extname(
                filePath
            ).toLowerCase();


        const mimeTypes = {

            ".jpg":
                "image/jpeg",

            ".jpeg":
                "image/jpeg",

            ".png":
                "image/png",

            ".webp":
                "image/webp",

            ".gif":
                "image/gif"

        };


        const mimeType =
            mimeTypes[extension];


        if (!mimeType) {

            throw new Error(
                `Unsupported image type: ${extension}`
            );

        }


        return mimeType;

    }


    /**
     * Extract generated text from Gemini response.
     */
    extractText(data) {

        const candidates =
            data?.candidates;


        if (
            !Array.isArray(candidates) ||
            candidates.length === 0
        ) {

            return "";

        }


        const parts =
            candidates[0]?.content?.parts;


        if (
            !Array.isArray(parts)
        ) {

            return "";

        }


        return parts

            .filter(
                part =>
                    typeof part.text === "string"
            )

            .map(
                part =>
                    part.text
            )

            .join("\n")

            .trim();

    }

}


module.exports =
    new GeminiService();