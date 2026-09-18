class ShotSelectionPromptBuilder {

    static build({
        event,
        shots,
        durationSec
    }) {
        return {
            system: this.buildSystemPrompt(),
            user: this.buildUserPrompt({
                event,
                shots,
                durationSec
            })
        };
    }

    static buildSystemPrompt() {
        return `
You score camera shots for a recap voiceover.

You will see numbered stills, one per shot, plus each shot's duration.
The spoken voiceover length is given exactly. Score every shot you are shown.

For each shot return:
- shot: the shot number on the image
- sequence: viewing order. Shots that should play together get the same sequence. Earlier story beats are lower numbers.
- match: 0.0 to 10.0 how well this shot illustrates the voiceover line. Higher wins.

Rules:
- Score every labeled shot. Do not omit shots.
- Prefer faces, motion, reveals, and reactions.
- Empty holds and unrelated frames get a low match.
- Do not invent shot numbers.
- Do not return timestamps.

Return ONLY JSON:
{
  "shots": [
    { "shot": 1, "sequence": 1, "match": 9.9 },
    { "shot": 8, "sequence": 1, "match": 7.2 }
  ]
}
`.trim();
    }

    static buildUserPrompt({
        event,
        shots,
        durationSec
    }) {
        const catalog = shots
            .map((shot) => (
                `Shot ${shot.index}: ${Number(shot.durationSec || 0).toFixed(2)}s`
            ))
            .join("\n");

        return `
Event ${event.id}: ${event.story_arc || event.title || ""}
Voiceover (${Number(durationSec).toFixed(1)} seconds): ${event.narration_script || event.storyText || ""}
Visual target: ${event.visual_description || "the action that matches the voiceover"}

Shot catalog:
${catalog}

Score every shot. Higher match wins. We will keep the top matches until they cover ${Number(durationSec).toFixed(1)}s, then play them in sequence order.
`.trim();
    }

}

module.exports = ShotSelectionPromptBuilder;
