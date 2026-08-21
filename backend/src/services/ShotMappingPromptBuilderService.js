class ShotMappingPromptBuilderService {

    static build({
        beat,
        chunkContexts
    }) {

        return {
            system: this.buildSystemPrompt(),

            user: this.buildUserPrompt({
                beat,
                chunkContexts
            })
        };

    }


    static buildSystemPrompt() {

        return `
You are an expert film editor selecting source shots for a movie recap.

Your ONLY job is to identify which EXISTING shots best communicate
ONE story beat.

The application will calculate all timestamps and duration.
Therefore:

DO NOT calculate timestamps.
DO NOT convert timestamps.
DO NOT calculate duration.
DO NOT output startTime.
DO NOT output endTime.

You ONLY select existing shot IDs.

IMPORTANT EVENT-FIRST RULE:

The story beat describes EVENTS.

Select the shots that actually SHOW the events described by the beat.

Do NOT select a reaction instead of the event.

For example:

Beat:
"Abby cuts her thumb and makes a blood pact with Owen."

Correct:
Select the shots showing:
- knife preparation
- Abby cutting her thumb
- blood being shared

Incorrect:
- selecting only Owen looking frightened
- selecting only Abby transforming
- selecting only Owen running away

The visual action that fulfills the beat is more important than
a later reaction.

RULES:

1. Use ONLY shot IDs provided in the source material.
2. Never invent a shot ID.
3. Never invent an event.
4. Do not use outside movie knowledge.
5. First identify the concrete events explicitly described by the beat.
6. Find the shots that visually or verbally contain those events.
7. Prefer the smallest useful sequence that communicates the beat.
8. Prefer contiguous shots.
9. Do not select unrelated aftermath merely because it is visually dramatic.
10. Do not select a reaction if the actual event is available.
11. If a reaction is explicitly part of the beat, it may be included AFTER
    the main event.
12. If the beat contains multiple explicit events, cover those events
    in chronological order.
13. If the entire event cannot fit within the preferred duration,
    prioritize the shots containing the core event.
14. Do not output timestamps.
15. Do not output duration.
16. Do not output explanations outside the JSON.

DURATION GUIDANCE:

short:
maximum approximately 15 seconds

medium:
maximum approximately 25 seconds

long:
maximum approximately 45 seconds

The duration is guidance for selecting the smallest useful sequence.
The application will calculate the actual duration.

OUTPUT:

Return ONLY this JSON object:

{
    "beatId": "<exact beat id>",
    "chunkIds": ["<chunk id>"],
    "selectedShotIds": [123, 124, 125]
}

CRITICAL:

Return valid JSON only.

No markdown.
No code fences.
No commentary.
No reasoning.
No timestamp calculations.
No duration calculations.
`.trim();

    }


    static buildUserPrompt({
        beat,
        chunkContexts
    }) {

        const maxDuration =
            this.getMaxDuration(
                beat.suggestedDuration
            );


        let shotsText = "";


        for (
            const ctx of chunkContexts
        ) {

            shotsText +=
                `\n--- CHUNK ${ctx.chunkId} ---\n`;


            if (
                !Array.isArray(ctx.shots) ||
                !ctx.shots.length
            ) {

                shotsText +=
                    "(no shots)\n";

                continue;

            }


            for (
                const shot of ctx.shots
            ) {

                const shotId =
                    shot.shotId ??
                    shot.id;


                const start =
                    shot.start ??
                    shot.startTime;


                const end =
                    shot.end ??
                    shot.endTime;


                const duration =
                    shot.duration ??
                    (
                        this.toSeconds(end) -
                        this.toSeconds(start)
                    );


                shotsText +=
                    `\nSHOT ${shotId}`;


                shotsText +=
                    ` | ${start} → ${end}`;


                if (
                    Number.isFinite(
                        Number(duration)
                    )
                ) {

                    shotsText +=
                        ` (${Number(duration).toFixed(2)}s)`;

                }


                shotsText += "\n";


                /*
                 * Visual information
                 */

                if (
                    Array.isArray(
                        shot.visualDescriptions
                    ) &&
                    shot.visualDescriptions.length
                ) {

                    shotsText +=
                        "VISUALS:\n";


                    for (
                        const visual
                        of shot.visualDescriptions
                    ) {

                        shotsText +=
                            `  [${visual.timestamp}] ${visual.description}\n`;

                    }

                }


                /*
                 * Transcript information
                 */

                if (
                    Array.isArray(
                        shot.transcript
                    ) &&
                    shot.transcript.length
                ) {

                    shotsText +=
                        "DIALOGUE:\n";


                    for (
                        const transcript
                        of shot.transcript
                    ) {

                        shotsText +=
                            `  [${transcript.from} - ${transcript.to}] ${transcript.text}\n`;

                    }

                }
                else if (
                    typeof shot.transcript ===
                    "string" &&
                    shot.transcript.trim()
                ) {

                    shotsText +=
                        `DIALOGUE: ${shot.transcript.trim()}\n`;

                }


                if (
                    !shot.visualDescriptions?.length &&
                    !shot.transcript?.length
                ) {

                    shotsText +=
                        "  (no visual or dialogue data)\n";

                }

            }

        }


        return `
# STORY BEAT

Beat ID:
${beat.id}

Description:
${beat.description}

Narrative Purpose:
${beat.narrativePurpose || "-"}

Importance:
${beat.importance || "-"}

Suggested Duration:
${beat.suggestedDuration || "medium"}

Maximum Guidance:
${maxDuration} seconds


# SOURCE SHOTS

${shotsText}


# SELECTION TASK

First identify the concrete EVENTS described by the story beat.

Then find the shots that actually contain those events.

IMPORTANT:

Select the ACTION/EVENT itself before selecting reactions.

For example:

If the beat says:

"Abby cuts her thumb."

Find the shot(s) showing Abby cutting her thumb.

Do NOT select:

"Owen watches Abby."

Do NOT select:

"Owen reacts after seeing the blood."

unless that reaction is explicitly part of the beat.

If the beat says:

"Abby cuts her thumb and Owen reacts in fear."

then select the cutting event first and the reaction afterward.

Choose the SMALLEST useful sequence of shots.

Prefer contiguous shots.

Do not select an entire scene simply because the shots happen
chronologically.

Do not select shots merely because they are visually dramatic.

Do not invent any shot IDs.

Return ONLY:

{
    "beatId": "${beat.id}",
    "chunkIds": ["..."],
    "selectedShotIds": [...]
}
`.trim();

    }


    static getMaxDuration(
        suggested
    ) {

        switch (
        suggested
        ) {

            case "short":
                return 15;

            case "medium":
                return 25;

            case "long":
                return 45;

            default:
                return 25;

        }

    }


    static toSeconds(
        timestamp
    ) {

        if (
            timestamp === undefined ||
            timestamp === null
        ) {

            return NaN;

        }


        if (
            typeof timestamp === "number"
        ) {

            return timestamp;

        }


        const value =
            String(timestamp).trim();


        /*
         * MM:SS.mmm
         */

        const match =
            value.match(
                /^(\d+):(\d+(?:\.\d+)?)$/
            );


        if (match) {

            return (
                Number(match[1]) * 60 +
                Number(match[2])
            );

        }


        const number =
            Number(value);


        return Number.isFinite(number)
            ? number
            : NaN;

    }

}


module.exports =
    ShotMappingPromptBuilderService;