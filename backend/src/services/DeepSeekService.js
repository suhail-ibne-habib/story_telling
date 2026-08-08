const OpenAI = require("openai");

class DeepSeekService {
    constructor() {
        this.model = "deepseek-v4-pro"
        this.baseURL = "https://api.deepseek.com";
        this.apiKey = process.env.DEEPSEEK_API_KEY
        this.client = new OpenAI({
            baseURL: this.baseURL,
            apiKey: this.apiKey
        });
    }

    async generate({
        system,
        user
    }) {

        const payload = {
            model: this.model,
            stream: false,
            messages: [
                {
                    role: "system",
                    content: system
                },
                {
                    role: "user",
                    content: user
                }
            ]
        }

        const started = Date.now();

        const response = await this.client.chat.completions.create(payload)

        console.log(
            `[DeepSeek] Completed in ${(
                (Date.now() - started) / 1000
            ).toFixed(2)}s`
        );

        return response.choices[0].message.content
    }
}

module.exports = new DeepSeekService()