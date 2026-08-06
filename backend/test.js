const { Ollama } = require("ollama");

const ollama = new Ollama();

(async () => {
    const response = await ollama.chat({
        model: "qwen3:4b",
        messages: [
            {
                role: "system",
                content: "You are a helpful assistant."
            },
            {
                role: "user",
                content: JSON.stringify({
                    movie: {
                        title: "Bride of Chucky",
                        genres: ["Horror", "Comedy"]
                    },
                    characters: [
                        { id: "C1", name: "Chucky" },
                        { id: "C2", name: "Tiffany" }
                    ],
                    chunk: {
                        timeline: {
                            start: 0,
                            end: 180
                        },
                        transcript: []
                    }
                })
            }
        ]
    });

    console.log(response.message.content);
})();