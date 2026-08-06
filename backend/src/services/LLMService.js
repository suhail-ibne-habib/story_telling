const { Ollama } = require("ollama");

const ollama = new Ollama({
    host: "http://127.0.0.1:11434",
});

class LLMService {
    constructor() {
        this.model = process.env.OLLAMA_MODEL;
    }

    async generate({ system, user, images = [] }) {

        console.log(
            `Sending ${Buffer.byteLength(user, "utf8")} bytes to ${this.model}`
        );

        console.log({
            hasSystem: typeof system,
            hasUser: typeof user,
            imageCount: images.length
        });

        try {
            const response = await ollama.chat({
                model: this.model,
                messages: this.buildMessages({
                    system,
                    user,
                    images
                }),
                stream: true,
                format: "json",
            });

            let content = "";

            for await (const part of response) {
                if (part.message?.content) {
                    content += part.message.content;
                }
            }

            return content;
        } catch (err) {
            console.error("Messages being sent:");
            console.dir(this.buildMessages({ system, user, images }), { depth: null });

            throw err;
        }
    }

    buildMessages({ system, user, images }) {
        return [
            {
                role: "system",
                content: system
            },
            {
                role: "user",
                content: user,
                images
            }
        ];
    }

}


module.exports = new LLMService();