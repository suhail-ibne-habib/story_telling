const fs = require("fs");
const { EdgeTTS } = require("@andresaya/edge-tts");

class VoiceGenerationService {

    constructor() {
        this.voice =
            process.env.EDGE_TTS_VOICE ||
            "en-US-AriaNeural";

        this.rate =
            process.env.EDGE_TTS_RATE ||
            "-5%";
    }

    async generate({
        text,
        outputPath
    }) {

        const storyText = String(text || "").trim();

        if (!storyText) {
            throw new Error("storyText is empty.");
        }

        console.log(
            `[Voice] Generating ${storyText.length} characters with ${this.voice}`
        );

        const tts = new EdgeTTS();

        await tts.synthesize(
            storyText,
            this.voice,
            {
                rate: this.rate,
                outputFormat: "audio-24khz-96kbitrate-mono-mp3"
            }
        );

        const audio = tts.toBuffer();

        if (!audio || audio.length === 0) {
            throw new Error("Edge TTS returned empty audio.");
        }

        await fs.promises.writeFile(outputPath, audio);

        if (!fs.existsSync(outputPath)) {
            throw new Error(
                `Voice file was not created: ${outputPath}`
            );
        }

        return outputPath;
    }

}

module.exports = new VoiceGenerationService();
