const { OpenAI } = require("openai");

class DeepSeekService {

    constructor() {
        this.model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
        this.client = null;
    }

    getClient() {
        if (!process.env.DEEPSEEK_API_KEY) {
            throw new Error("DEEPSEEK_API_KEY is not configured.");
        }

        if (!this.client) {
            this.client = new OpenAI({
                apiKey: process.env.DEEPSEEK_API_KEY,
                baseURL: "https://api.deepseek.com",
                timeout: 1000 * 60 * 5
            });
        }

        return this.client;
    }

    async chatJson({ messages, temperature = 0.7, maxTokens = 4000 }) {
        const started = Date.now();
        const response = await this.getClient().chat.completions.create({
            model: this.model,
            messages,
            temperature,
            max_tokens: maxTokens,
            response_format: { type: "json_object" }
        });

        const text = response.choices?.[0]?.message?.content || "";
        const finishReason = response.choices?.[0]?.finish_reason || null;
        const usage = response.usage || {};

        console.log(
            `[DeepSeek] ${this.model} ${((Date.now() - started) / 1000).toFixed(1)}s · ` +
            `prompt ${usage.prompt_tokens ?? "?"} (cache hit ${usage.prompt_cache_hit_tokens ?? 0}) · ` +
            `output ${usage.completion_tokens ?? "?"}` +
            (finishReason === "length" ? " · CUT OFF (output limit)" : "")
        );

        if (!text.trim()) {
            throw new Error("DeepSeek returned an empty response.");
        }

        return { text, usage, finishReason };
    }
}

module.exports = new DeepSeekService();
