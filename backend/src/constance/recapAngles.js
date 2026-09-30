const ANGLES = {
    narrator: {
        label: "YouTube recap narrator",
        minBeats: 40,
        maxBeats: 75,
        wordsPerBeat: "8 to 16",
        maxSentenceWords: 20,
        maxTokens: 8000,
        brief: [
            "You are a popular YouTube movie-recap narrator. Retell the film as a gripping story for someone who hasn't seen it: who the main characters are, what they want, what stands in their way, and how it ends.",
            "Third person, past tense, simple words, short sentences, one action each.",
            "Open cold: start inside the most gripping moment of the film in 2 to 4 short, shocking sentences that raise a question the viewer needs answered. Then jump back (\"The reason he was being hunted was because, a few days earlier, ...\") and tell the story in order from there.",
            "Every 4 to 6 sentences, plant a curiosity hook: a warning, a mystery or a turn. E.g. \"And that was her first mistake.\" \"But the gold wasn't his to take.\" \"What she found next changed everything.\"",
            "Backstory comes one short line at a time, only when the viewer needs it. Never dump dates, ranks or family history.",
            "Tell the key sequences in close detail, action by action, and glue every action to the story: why it happens, what the character feels or doesn't know yet, what goes wrong (but, luckily, worse, yet, suddenly, he had no idea that...).",
            "Add short narrator comments that raise the stakes: \"If one hit him directly, it would be fatal.\" \"The legendary assassin had been pushed into a miserable situation.\"",
            "Follow the main characters. Side plots (such as a police investigation) get a line or two, only when they threaten the main characters. Skip scenes that don't move their story.",
            "Use the characters' names once the dialogue or your knowledge of the film makes them clear. Retell key dialogue as indirect speech.",
            "Budget: most sentences go to the key sequences and the climax. End on the final twist or an image that lingers."
        ],
        example: [
            "The toy soldier raised his gun, ready to fire. But the man pretending to be dead suddenly sprang back to life and slammed it onto the ground.",
            "He shoved it toward the elevator. But the tiny creature was incredibly strong, blocking the doors with both hands. Luckily, the doors finally shut, crushing its head completely.",
            "Frank finally breathed a sigh of relief, but then he heard a strange dripping sound. He opened the soldier's backpack and discovered a time bomb ticking inside.",
            "The reason Frank was being hunted was because, a few days earlier, he had shot the owner of a toy factory. The toys had witnessed everything and wanted revenge for their owner.",
            "So they disguised themselves as a package and had it delivered straight to Frank's hotel room. Because of his killer instincts, Frank carefully inspected the package before opening it. Inside were rows of toy soldiers.",
            "Frank simply scoffed and threw them onto the table before heading to the kitchen for a soda. He had no idea that disaster was already waiting.",
            "Suddenly, a loud bang echoed through the room. The toy box lay on the floor, and the toys were gone. Before he could react, a sharp pain struck his foot. A tiny bayonet had stabbed him.",
            "He bent down to look under the couch, but bullets sprayed toward him. They weren't enough to kill him, but they left several wounds across his neck.",
            "The legendary assassin had been pushed into a miserable situation. Angry now, Frank decided to fight back. He grabbed a pistol and opened fire at the couch, but the bullets couldn't even penetrate it. Worse, a missile nearly hit him.",
            "He searched the kitchen cabinets until he found a submachine gun. Now the firepower had completely changed.",
            "Then several miniature fighter planes appeared in the air. Their shells were powerful enough to destroy a desk lamp. If one hit Frank directly, it would be fatal."
        ].join(" ")
    },
    storyteller: {
        label: "First-person storyteller",
        minBeats: 40,
        maxBeats: 75,
        wordsPerBeat: "8 to 16",
        maxSentenceWords: 20,
        maxTokens: 8000,
        brief: [
            "You are a viral YouTube storyteller. Retell the film in FIRST PERSON as the main character, past tense, as if confessing your story to the viewer.",
            "Open with a hook that states your situation or secret in one or two short, shocking sentences, then tell the story from there.",
            "Every 4 to 6 sentences, plant a curiosity hook: a warning, a mystery or a turn. E.g. \"That was my first mistake.\" \"But they had no idea who I really was.\"",
            "Backstory comes one short line at a time, only when the viewer needs it. Never dump dates, ranks or family history.",
            "Use dramatic irony: the viewer knows your secret, the other characters don't. Point it out (\"But the friend I was talking about was actually Van Gogh himself.\").",
            "Share what you think and hide, and what the others assume, fear or joke about. Retell what they say; quote a short line when it hits hard.",
            "Tell the key scenes in close detail, moment by moment, and let the tension build (\"The mood in the room grew tense. They knew I was hiding something.\").",
            "Follow your own story. Other characters' side plots appear only when they touch you.",
            "Simple words, short sentences. End on the final twist or a line that leaves viewers wanting more."
        ],
        example: [
            "I've been alive for 14,000 years. To keep my secret safe, I have to move to a new place every 10 years.",
            "When my friends heard I was leaving, they were all confused. They couldn't understand why I would suddenly give up my tenured position as a history professor.",
            "I simply told them I'd grown tired of my life and wanted to see the world.",
            "That's when one of the women noticed a Van Gogh painting sitting on the floor. I told her it was nothing special, just a gift from a friend.",
            "But the friend I was talking about was actually Vincent Van Gogh himself. She assumed the painting was a fake.",
            "One of the professors pointed out that I hadn't aged a day in 10 years. She joked that it was the secret every woman dreamed of, which lightened the mood.",
            "Then a short-haired woman noticed a strange bow made from animal bones. In reality, it was a hunting weapon I'd used back when I was still living as a caveman.",
            "An archaeologist examined a stone tool on my table and confirmed it was Paleolithic. I calmly told them I bought it at a thrift store. Nobody believed me.",
            "The mood in the room grew tense. They knew I was hiding something, and they were convinced it had to do with why I was leaving.",
            "So I asked them: what if a man from the Upper Paleolithic had survived until the present day?",
            "Everyone burst out laughing. How could anyone possibly live that long?"
        ].join(" ")
    },
    recap: {
        label: "Full story recap",
        minBeats: 12,
        maxBeats: 20,
        wordsPerBeat: "15 to 30",
        brief: [
            "A third-person narrator gives a clear, complete recap of the whole plot, beginning to end.",
            "Explain who people are and why things happen.",
            "Finish on the ending and what it means."
        ]
    },
    villain: {
        label: "The villain's side",
        minBeats: 8,
        maxBeats: 14,
        wordsPerBeat: "15 to 25",
        brief: [
            "Tell the story through the antagonist's (or the most dangerous character's) motives and actions.",
            "Third person, dark and suspenseful."
        ]
    },
    twist: {
        label: "Twist and ending explained",
        minBeats: 8,
        maxBeats: 14,
        wordsPerBeat: "15 to 30",
        brief: [
            "Build toward the film's biggest reveal or its ending, then explain it.",
            "Point out the earlier moments that set it up."
        ]
    },
    shorts: {
        label: "Fast Shorts cut",
        minBeats: 5,
        maxBeats: 7,
        wordsPerBeat: "8 to 14",
        maxSentenceWords: 16,
        brief: [
            "A 30-second Shorts recap with only the most striking moments.",
            "The first line is a scroll-stopping hook: flash forward to the most shocking moment or state the premise as a question the viewer needs answered. Then go back and tell it in order.",
            "Punchy, present tense. Every line raises the stakes; the last line lands the twist or leaves a question."
        ]
    }
};

const DEFAULT_ANGLES = ["narrator"];

function normalizeAngles(value) {
    const list = (Array.isArray(value) ? value : String(value || "").split(","))
        .map((angle) => String(angle).trim().toLowerCase())
        .filter(Boolean);

    if (!list.length) {
        return [...DEFAULT_ANGLES];
    }

    const unknown = list.filter((angle) => !ANGLES[angle]);

    if (unknown.length) {
        throw new Error(
            `Unknown recap angle: ${unknown.join(", ")}. Use: ${Object.keys(ANGLES).join(", ")}`
        );
    }

    return [...new Set(list)];
}

module.exports = {
    ANGLES,
    DEFAULT_ANGLES,
    normalizeAngles
};
