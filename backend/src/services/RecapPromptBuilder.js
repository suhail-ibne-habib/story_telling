const { formatClockHms } = require("./TimeService");

const SYSTEM = [
    "You write scripts for viral YouTube movie-recap videos. The script is a gripping story the viewer HEARS; footage from the film plays underneath it as B-roll.",
    "",
    "You get the movie's scene list, built from the actual movie file:",
    "<scene id> <start>-<end> | <summary of the scene, from a vision model>",
    "  <moment id> <time> <what one frame shows, from a vision model>",
    "  dialogue: \"<speech heard in the scene>\"",
    "Moments marked [text] are credits, titles or logos. Moments marked [not described] were blocked by the vision filter (usually violence).",
    "The scene list is your reference for what happens and when. The vision descriptions are literal and dry on purpose: never write like them.",
    "The vision model doesn't know names; use the dialogue and your knowledge of the film for names, relationships, motives and what events mean.",
    "",
    "Rules:",
    "1. Tell a story, not a list of shots: motives, feelings, stakes, dramatic irony, cause and effect, narrator commentary.",
    "2. Plot events must really happen in the film. Don't invent events, secret motives or backstory the film doesn't have. Characters who die stay dead.",
    "3. Never put timestamps or IDs in the narration. Retell dialogue in your own words; quote only a short line when it hits hard.",
    "4. Answer with JSON only."
].join("\n");

// The system prompt and scene list must stay byte-identical across angles so DeepSeek's prefix cache hits.
function buildContextMessages({ title, index, lines }) {
    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: [
                `MOVIE: ${title}`,
                `RUNTIME: ${formatClockHms(index.movie.duration_sec * 1000)}`,
                `SCENES (${index.scenes.length}):`,
                lines.trim()
            ].join("\n")
        }
    ];
}

function beatRange(angle) {
    return angle.minBeats === angle.maxBeats
        ? `exactly ${angle.minBeats}`
        : `${angle.minBeats} to ${angle.maxBeats}`;
}

// Step 0: plain facts, shared by every angle, so versions don't contradict each other or the film.
function buildFactsMessage() {
    return {
        role: "user",
        content: [
            "Before any writing, work out what actually happens in this film. No drama, just facts.",
            "Use the dialogue first, the scene descriptions second, and your own knowledge of the film only where you are sure it is this film.",
            "",
            "Return JSON:",
            "{",
            '  "characters": [{"name": "name used in the film", "who": "role, relationships, how to recognise them on screen"}],',
            '  "plot": ["S012-S014: what happens, who does it and why", "..."],',
            '  "ending": "how the film ends and what it means",',
            '  "uncertain": ["anything the dialogue and descriptions leave unclear"]',
            "}",
            "",
            "Cover the whole film in order in 25 to 45 plot points. Scene IDs in the plot points are for your own reference.",
            "Keep each character's fate consistent: if someone dies, they stay dead."
        ].join("\n")
    };
}

// Step 1: the story alone, no IDs, so the writing isn't bent around citations.
function buildStoryMessage(angle, sceneCount) {
    const sentenceRule = angle.maxSentenceWords
        ? `Every sentence is ${angle.wordsPerBeat} words, never more than ${angle.maxSentenceWords}. Split long sentences.`
        : `Sentences are ${angle.wordsPerBeat} words each.`;

    return {
        role: "user",
        content: [
            `ANGLE: ${angle.label}`,
            ...angle.brief,
            ...(angle.example
                ? [
                    "",
                    "STYLE EXAMPLE (from a different film; copy the storytelling, not the content):",
                    angle.example
                ]
                : []),
            "",
            "Base the story on your FACTS above: no events that aren't in them, nothing that contradicts them.",
            `Write the narration as flowing paragraphs of ${beatRange(angle)} sentences. ${sentenceRule}`,
            `The list has ${sceneCount} scenes; most of them won't be mentioned. Tell the story, don't walk through the list.`,
            "Don't think about footage yet; that comes later.",
            "",
            'Return JSON: {"title": "video title", "story": "the narration"}'
        ].join("\n")
    };
}

function buildTightenMessage(angle, examples) {
    return {
        role: "user",
        content: [
            `Too many sentences are longer than ${angle.maxSentenceWords} words, e.g.:`,
            ...examples.map((sentence) => `- ${sentence}`),
            "",
            `Rewrite the whole story with sentences of ${angle.wordsPerBeat} words, at most ${angle.maxBeats} sentences in total. Split long sentences, cut dates, ranks and side details, keep the hooks and key plot points.`,
            'Return JSON: {"title": "video title", "story": "the narration"}'
        ].join("\n")
    };
}

// Step 2: the story text is locked; DeepSeek only picks the footage under each numbered line, one batch at a time.
function buildBeatsMessage({ lines, start, end, usedIds }) {
    return {
        role: "user",
        content: [
            "You are now the video editor. Your story above is final and has been split into numbered lines. Do not rewrite them.",
            `Pick the footage for lines ${start + 1} to ${end}:`,
            "",
            ...lines.slice(start, end).map((line, offset) => `${start + offset + 1}. ${line}`),
            "",
            "For every line, pick 1 to 3 moments from the scene list showing the people and situation the line is about.",
            "Each moment you pick becomes its own shot, played in the order you list them, sharing the line's time (about 2.5 seconds per moment). Lines under 10 words get 1 moment.",
            "If a line talks about two or three things (a person and a place, an action and a reaction), pick one moment for each, in the order they are spoken.",
            "For lines about feelings, backstory or meaning, pick a moment of that character in that situation.",
            "Footage can come from anywhere in the film, in any order (cold opens and flashbacks are fine). Never pick [text] moments.",
            ...(usedIds.length ? [`Already used by earlier lines, don't pick again: ${usedIds.join(", ")}`] : []),
            '"shows" says what is on screen, one part per moment separated by ";", under 10 words per part.',
            "",
            `Return JSON with exactly one entry for each line from ${start + 1} to ${end}, keeping these numbers:`,
            `{"beats": [{"n": ${start + 1}, "moments": ["S045.2", "S047.5"], "shows": "girl hands boy a solved cube; boy stares at it"}]}`,
            "Output compact JSON without extra line breaks."
        ].join("\n")
    };
}

function buildMissingLinesMessage(missing) {
    return {
        role: "user",
        content: `These lines got no footage: ${missing.join(", ")}. Return the full JSON again with exactly one entry for every line in the range, keeping the line numbers.`
    };
}

function buildRepairMessage(errors) {
    return {
        role: "user",
        content: [
            "Your answer broke these rules:",
            ...errors.map((error) => `- ${error}`),
            "",
            "Fix them and return the full corrected JSON."
        ].join("\n")
    };
}

function buildRewriteMessages({ angle, previous, text, next, visible }) {
    return [
        {
            role: "system",
            content: "You fix single lines of movie recap narration so they match the footage playing under them. Answer with JSON only."
        },
        {
            role: "user",
            content: [
                `STYLE: ${angle.label}. ${angle.brief.join(" ")}`,
                previous ? `PREVIOUS LINE: ${previous}` : "PREVIOUS LINE: (none, this is the first line)",
                `LINE TO FIX: ${text}`,
                next ? `NEXT LINE: ${next}` : "NEXT LINE: (none, this is the last line)",
                `THE FOOTAGE UNDER THIS LINE SHOWS: ${visible}`,
                "",
                `Rewrite the line in ${angle.wordsPerBeat} words so it keeps the story moving between the previous and next line, but only claims what the footage shows. Keep the same voice and tense.`,
                'Return JSON: {"text": "rewritten line"}'
            ].join("\n")
        }
    ];
}

module.exports = {
    buildContextMessages,
    buildFactsMessage,
    buildStoryMessage,
    buildTightenMessage,
    buildBeatsMessage,
    buildMissingLinesMessage,
    buildRepairMessage,
    buildRewriteMessages
};
