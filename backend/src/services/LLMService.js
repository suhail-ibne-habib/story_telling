const fs = require("fs").promises;
const axios = require("axios")

class LLMService {

    constructor() {
        this.host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
        this.model = process.env.OLLAMA_MODEL;
    }

    async generate(prompt) {

        const {
            system,
            user,
            images = []
        } = prompt;

        console.log(
            `Sending ${Buffer.byteLength(user, "utf8")} bytes to ${this.model}`
        );

        console.log({
            hasSystem: typeof system,
            hasUser: typeof user,
            imageCount: images.length
        });

        let payload;

        try {
            console.log("1");

            payload = await this.buildPayload({
                system,
                user,
                images
            })

            console.log("2");

            const started = Date.now()

            const response = await axios.post(
                `${this.host}/api/chat`,
                payload,
                {
                    timeout: 1000 * 60 * 20,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity
                }
            );

            console.log("3");

            console.log(
                `LLM completed in ${((Date.now() - started) / 1000).toFixed(2)}s`
            );

            console.dir(payload, {
                depth: null
            });

            console.log("4");

            return response.data.message;

        } catch (err) {

            console.error("===== OLLAMA ERROR =====");

            console.error(err);

            console.dir(err, {
                depth: null
            });

            console.error("===== REQUEST PAYLOAD =====");

            console.dir(payload, {
                depth: null
            });

            throw err;
        }
    }

    async buildPayload({
        system,
        user,
        images
    }) {

        const encodedImages =
            await this.encodeImages(images);

        return {

            model: this.model,

            think: false,

            stream: false,

            options: {
                num_predict: 2048
            },

            messages: [

                {
                    role: "system",
                    content: system
                },

                {
                    role: "user",
                    content: user,
                    images: encodedImages
                }

            ]

        };

    }

    async encodeImages(imagePaths) {

        const images = [];

        for (const imagePath of imagePaths) {

            const buffer =
                await fs.readFile(imagePath);

            images.push(
                buffer.toString("base64")
            );

        }

        return images;

    }

}

module.exports = new LLMService();