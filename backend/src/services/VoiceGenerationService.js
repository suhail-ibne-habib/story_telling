const fs = require("fs");
const path = require("path");

const {
    ElevenLabsClient
} = require("@elevenlabs/elevenlabs-js");


const elevenlabs =
    new ElevenLabsClient({

        apiKey:
            process.env.ELEVENLABS_API_KEY

    });


class VoiceGenerationService {

    async generate({
        text,
        outputPath
    }) {

        if (
            !text ||
            !text.trim()
        ) {

            throw new Error(
                "Voice generation text is required."
            );

        }


        if (!outputPath) {

            throw new Error(
                "Voice generation output path is required."
            );

        }


        await fs.promises.mkdir(

            path.dirname(outputPath),

            {
                recursive: true
            }

        );


        console.log(
            `[VoiceGeneration] Generating voice...`
        );


        console.log(
            `[VoiceGeneration] Output: ${outputPath}`
        );


        /*
         * -----------------------------------------
         * Generate speech
         * -----------------------------------------
         */

        const audio =
            await elevenlabs.textToSpeech.convert(

                "JBFqnCBsd6RMkjVDRZzb",

                {
                    text,

                    modelId:
                        "eleven_multilingual_v2",

                    outputFormat:
                        "mp3_44100_128"
                }

            );


        /*
         * -----------------------------------------
         * Convert response to Buffer
         * -----------------------------------------
         */

        const chunks = [];


        for await (
            const chunk of audio
        ) {

            chunks.push(
                Buffer.from(chunk)
            );

        }


        const audioBuffer =
            Buffer.concat(chunks);


        /*
         * -----------------------------------------
         * Save MP3
         * -----------------------------------------
         */

        await fs.promises.writeFile(

            outputPath,

            audioBuffer

        );


        console.log(
            `[VoiceGeneration] Completed: ${outputPath}`
        );


        return outputPath;

    }

}


module.exports =
    new VoiceGenerationService();