class EventExtractionPromptBuilderService {

    static targetRecap(durationSec) {
        if (!Number.isFinite(durationSec) || durationSec < 15 * 60) {
            return "2-3 minutes of spoken narration";
        }

        return "6-8 minutes of spoken narration (never under 5, never over 10)";
    }

    static build({ durationSec }) {
        return {
            system: this.buildSystemPrompt(),
            user: this.buildUserPrompt({ durationSec })
        };
    }

    static buildSystemPrompt() {
        return `
You are a recap editor and narrator.

Watch the video. Return ONE JSON object with a full_recap array.
No shorts. No markdown. No extra keys.

GOAL
A fast, attractive YouTube recap of the story spine only.
Skip filler, B-plots, slow setup, establishing holds, and background TV/news.
Keep only the events that sell the story: hook, pressure, turn, climax, sting.

NARRATION
Write like a recap narrator selling tension, not a visual describer.
Each narration_script is the voiceover for THAT event only — 1 to 3 punchy sentences.
Do not invent character names. If a name is clearly spoken, use it.
Otherwise describe the person ("an old lady at the casino").

TIMES
start_time and end_time are coarse windows on THIS video, format HH:MM:SS.
They do not need frame accuracy. Typical window 20-90 seconds.
We will cut camera shots locally from that window later.
Never output a time past the video duration.
end_time must be after start_time. Never use the same timestamp for both.
Give each event its own distinct window. Do not pin leftover events to the final second of the video.

FIELDS per event
- scene_id: integer starting at 1, chronological
- start_time: HH:MM:SS
- end_time: HH:MM:SS
- story_arc: short label
- narration_script: voiceover for this event
- visual_description: the shot that best matches the line
  (example: "Close-up of the protagonist dropping the phone")

Return ONLY:
{ "full_recap": [ { "scene_id": 1, "start_time": "00:01:15", "end_time": "00:02:00", "story_arc": "", "narration_script": "", "visual_description": "" } ] }
`.trim();
    }

    static buildUserPrompt({ durationSec }) {
        const hours = Math.floor(durationSec / 3600);
        const minutes = Math.floor((durationSec % 3600) / 60);
        const seconds = Math.floor(durationSec % 60);
        const clock = [
            String(hours).padStart(2, "0"),
            String(minutes).padStart(2, "0"),
            String(seconds).padStart(2, "0")
        ].join(":");

        return `
Video duration: ${clock} (${Math.round(durationSec)} seconds).
Write a finished recap whose spoken narration lands around ${this.targetRecap(durationSec)}.
Return the JSON now.
`.trim();
    }

}

module.exports = EventExtractionPromptBuilderService;
