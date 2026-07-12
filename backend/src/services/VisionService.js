const fs = require('fs')

class VisionService {
    constructor() {
        this.url = "http://localhost:11434/api/generate";
        this.model = "qwen3-vl:4b";
    }

    async analyze(imagePath) {

        const imageBuffer = await fs.promises.readFile(imagePath)

        const imageBase64 = imageBuffer.toString("base64")

        const prompt = `
            Analyze this representative frame from a movie shot.

            Describe only visually observable information.

            Do not explain the story.
            Do not infer plot events.
            Do not guess character names.
            Do not identify real people.
            Do not invent information outside the frame.

            Be concise.
            `;

        const schema = {
            type: "object",

            properties: {

                description: {
                    type: "string"
                },

                location: {
                    type: "string"
                },

                people: {
                    type: "array",

                    items: {
                        type: "object",

                        properties: {

                            visualDescription: {
                                type: "string"
                            },

                            action: {
                                type: "string"
                            }

                        },

                        required: [
                            "visualDescription",
                            "action"
                        ]
                    }
                },

                action: {
                    type: "string"
                },

                mood: {
                    type: "string"
                }

            },

            required: [
                "description",
                "location",
                "people",
                "action",
                "mood"
            ]
        };

        const response = await fetch(
            this.url,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt,
                    images: [imageBase64],
                    format: schema,
                    stream: false
                })
            }
        )

        if (!response.ok) {
            throw new Error(`Vision model failed: ${response.status}`)
        }

        const result = await response.json()
        const output = result.thinking

        return JSON.parse(output);

    }
}

module.exports = new VisionService()