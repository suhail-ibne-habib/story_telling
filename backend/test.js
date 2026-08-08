const { Ollama } = require("ollama");

const ollama = new Ollama();

(async () => {
    const response = await ollama.chat({
        model: "qwen3-vl:8b",
        stream: false,
        think: false,
        messages: [
            {
                role: "user",
                content: "Reply with exactly: Hello"
            }
        ]
    });

    console.dir(response, { depth: null });

    console.log(response.message.content);
})();