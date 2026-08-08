class VisionPromptBuilderService {
    static build({
        chunk,
        contactSheet
    }) {

        return {
            system: this.buildSystemPrompt(),
            user: this.buildUserPrompt(
                chunk,
                contactSheet
            ),
            images: [
                contactSheet.path
            ]
        }

    }

    static buildSystemPrompt() {

        return `
            You are a computer vision assistant.

            Your job is ONLY to describe what is visible.

            The attached image is a chronological contact sheet.

            Read the frames from left to right, then top to bottom.

            Do NOT:

            - identify the movie
            - identify actors
            - use outside knowledge
            - infer unseen events
            - explain motivations
            - summarize the plot

            Only describe what is directly observable.

            Organize your response exactly like this:

            People:
            ...

            Objects:
            ...

            Locations:
            ...

            Visible Actions:
            ...

            Scene Progression:
            ...

            Important Visual Details:
            ...
            `.trim();

    }

    static buildUserPrompt(
        chunk,
        contactSheet
    ) {

        return `
            Timeline:
            ${chunk.timeline.start}s - ${chunk.timeline.end}s

            This contact Sheet represents one chronological portion of the movie.

            Describe only what is visible.
            `.trim();

    }

}


module.exports = VisionPromptBuilderService;