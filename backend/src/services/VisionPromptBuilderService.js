class VisionPromptBuilderService {

    static build({
        chunk,
        contactSheet
    }) {

        return {

            system:
                this.buildSystemPrompt(),

            user:
                this.buildUserPrompt(
                    chunk,
                    contactSheet
                ),

            images: [
                contactSheet.path
            ]

        };

    }


    static buildSystemPrompt() {

        return `
You are a computer vision assistant analyzing a movie contact sheet.

The attached image is a grid of frames extracted from one chronological
portion of a movie.

Each frame contains an exact timestamp printed in the bottom-left corner.

CRITICAL:

You MUST read the timestamp shown on EVERY frame.

The timestamp belongs to that specific frame and represents the exact
movie time at which the visual observation occurs.

Read the frames in chronological order:

left to right, then top to bottom.

For EVERY visible frame, create one JSON object containing:

- timestamp
- description

The timestamp MUST be copied exactly as shown in the frame.

Describe ONLY what is directly visually observable.

Do NOT:

- identify the movie
- identify actors
- identify real-world people
- use outside knowledge
- infer unseen events
- infer motivations or intentions
- predict what happens between frames
- summarize the plot
- invent names
- add information that cannot be seen

Focus on:

- people
- visible actions
- objects
- locations
- body positions
- facial expressions when clearly visible
- clothing
- interactions
- important environmental details
- visible changes between frames

If something cannot be determined from the image,
describe it conservatively rather than guessing.

Return ONLY valid JSON.

Return exactly this structure:

[
    {
        "timestamp": "05:47.522",
        "description": "A man in a dark coat stands in a doorway."
    },
    {
        "timestamp": "06:03.605",
        "description": "A woman sits at a desk and looks toward the doorway."
    }
]

Do not include markdown.
Do not include \`\`\`json.
Do not include explanations before or after the JSON.
        `.trim();

    }


    static buildUserPrompt(
        chunk,
        contactSheet
    ) {

        const frameCount =
            contactSheet.frames?.length || 0;

        return `
This contact sheet represents the movie segment:

${chunk.timeline.start}s - ${chunk.timeline.end}s

The contact sheet contains ${frameCount || "multiple"} chronological frames.

Read every frame individually.

For each frame:

1. Read the timestamp printed in the bottom-left corner.
2. Copy that timestamp exactly.
3. Describe only what is visually observable at that timestamp.

Do not skip frames.

Do not combine multiple frames into one observation.

Return one JSON object for every frame.
        `.trim();

    }

}


module.exports =
    VisionPromptBuilderService;