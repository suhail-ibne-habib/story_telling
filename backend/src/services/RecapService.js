const fs = require("fs");
const path = require("path");

const StorageService = require("../../storage/StorageService");
const ProgressService = require("./ProgressService");
const DeepSeekService = require("./DeepSeekService");
const MovieIndexService = require("./MovieIndexService");
const GetMovieIdentity = require("../core/GetMovieIdentity");
const GetFileName = require("../core/GetFileName");
const { ANGLES, normalizeAngles } = require("../constance/recapAngles");
const {
    buildContextMessages,
    buildFactsMessage,
    buildStoryMessage,
    buildTightenMessage,
    buildBeatsMessage,
    buildMissingLinesMessage
} = require("./RecapPromptBuilder");
const { validateRecap } = require("./RecapValidator");
const { readJson, writeJson, parseJsonFromText } = require("../utils/jsonFile");

const MAX_ATTEMPTS = 3;
const MIN_LINE_WORDS = 5;
const MAX_LONG_SHARE = 0.2;
const FOOTAGE_BATCH = 30;
const MAX_MISSING_SHARE = 0.1;
const MAX_MERGED_WORDS = 30;

function splitSentences(story) {
    return String(story || "")
        .replace(/\s+/g, " ")
        .trim()
        .split(/(?<=[.!?]["'”’]?)\s+(?=["'“‘]?[A-Z0-9])/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
}

function wordCount(text) {
    return text.split(" ").filter(Boolean).length;
}

// Sentences shorter than MIN_LINE_WORDS join the previous line so no clip is under ~2 seconds.
// Past maxLines, the shortest neighbouring lines are joined (each line is one clip).
function splitLines(story, maxLines) {
    const lines = [];

    splitSentences(story).forEach((sentence) => {
        if (lines.length && wordCount(sentence) < MIN_LINE_WORDS) {
            lines[lines.length - 1] = `${lines[lines.length - 1]} ${sentence}`;
        } else {
            lines.push(sentence);
        }
    });

    while (maxLines && lines.length > maxLines) {
        let best = -1;

        for (let order = 0; order < lines.length - 1; order += 1) {
            const words = wordCount(lines[order]) + wordCount(lines[order + 1]);

            if (words <= MAX_MERGED_WORDS &&
                (best < 0 || words < wordCount(lines[best]) + wordCount(lines[best + 1]))) {
                best = order;
            }
        }

        if (best < 0) {
            break;
        }

        lines.splice(best, 2, `${lines[best]} ${lines[best + 1]}`);
    }

    return lines;
}

function draftFileText(title, story) {
    return `${title}\n\n${story}\n`;
}

function parseDraftFile(text) {
    const [title, ...rest] = text.replace(/\r\n/g, "\n").split("\n\n");
    return { title: title.trim(), story: rest.join("\n\n").trim() };
}

function beatId(order) {
    return `B${String(order + 1).padStart(2, "0")}`;
}

class RecapService {

    manifestPath(jobId) {
        return path.join(StorageService.getPaths(jobId).recap, "recaps.json");
    }

    anglePaths(jobId, angle) {
        const dir = StorageService.getPaths(jobId).recap;

        return {
            dir,
            recap: path.join(dir, `${angle}.json`),
            story: path.join(dir, `${angle}.txt`),
            draft: path.join(dir, `${angle}_draft.txt`),
            attempts: path.join(dir, `${angle}_attempts.json`)
        };
    }

    async loadManifest(jobId) {
        const file = this.manifestPath(jobId);
        return fs.existsSync(file) ? readJson(file) : null;
    }

    async loadAngle(jobId, angle) {
        return readJson(this.anglePaths(jobId, angle).recap);
    }

    async hasRecap(jobId) {
        const manifest = await this.loadManifest(jobId).catch(() => null);

        if (!manifest?.angles?.length) {
            return false;
        }

        const index = await MovieIndexService.load(await GetFileName.getFileName(jobId)).catch(() => null);

        if (!index || manifest.index?.built_at !== index.built_at) {
            return false;
        }

        for (const angle of manifest.angles) {
            const recap = await this.loadAngle(jobId, angle).catch(() => null);

            if (!recap?.beats?.length) {
                return false;
            }
        }

        return true;
    }

    async anglesFor(jobId) {
        const progress = await ProgressService.load(jobId);
        return normalizeAngles(progress.angles);
    }

    async extract(jobId) {
        const { title } = await GetMovieIdentity.getIdentity(jobId);
        const filename = await GetFileName.getFileName(jobId);
        const index = await MovieIndexService.load(filename);

        if (!index?.complete) {
            throw new Error(`Movie index is not ready for ${filename}. Run the index stage first.`);
        }

        const angles = await this.anglesFor(jobId);
        const context = buildContextMessages({
            title,
            index,
            lines: MovieIndexService.toLines(index)
        });
        const sceneById = new Map(index.scenes.map((scene) => [scene.id, scene]));

        if (!index.scenes.every((scene) => Array.isArray(scene.moments))) {
            throw new Error(`Movie index for ${filename} is from an older version. Rebuild it with "npm run index".`);
        }

        await fs.promises.mkdir(StorageService.getPaths(jobId).recap, { recursive: true });

        const facts = await this.loadOrWriteFacts({ jobId, context, index });
        const grounded = [...context, buildFactsMessage(), { role: "assistant", content: facts.raw }];
        const recaps = [];

        for (const angle of angles) {
            recaps.push(await this.writeAngle({ jobId, title, angle, context: grounded, index, sceneById }));
        }

        const manifest = {
            title,
            angles,
            index: {
                filename,
                scenes: index.scenes.length,
                built_at: index.built_at
            },
            created_at: new Date().toISOString()
        };

        await writeJson(this.manifestPath(jobId), manifest);

        return { ...manifest, recaps };
    }

    factsPaths(jobId) {
        const dir = StorageService.getPaths(jobId).recap;
        return { json: path.join(dir, "facts.json"), text: path.join(dir, "facts.txt") };
    }

    // Plain facts of the film, written once per job and shared by every angle (and cached by DeepSeek).
    async loadOrWriteFacts({ jobId, context, index }) {
        const files = this.factsPaths(jobId);
        const existing = fs.existsSync(files.json) ? await readJson(files.json).catch(() => null) : null;

        if (existing?.raw && existing.index_built_at === index.built_at) {
            console.log("[Recap] Facts cached.");
            return existing;
        }

        const messages = [...context, buildFactsMessage()];

        for (let attempt = 1; attempt <= 2; attempt += 1) {
            console.log(`[Recap] Working out the facts of the film (attempt ${attempt})`);

            const { text } = await DeepSeekService.chatJson({ messages, temperature: 0.2, maxTokens: 6000 });

            try {
                const parsed = parseJsonFromText(text);

                if (Array.isArray(parsed.plot) && parsed.plot.length) {
                    const facts = { raw: text, parsed, index_built_at: index.built_at, created_at: new Date().toISOString() };

                    await writeJson(files.json, facts);
                    await fs.promises.writeFile(files.text, [
                        "CHARACTERS",
                        ...(parsed.characters || []).map((character) => `- ${character.name}: ${character.who}`),
                        "",
                        "PLOT",
                        ...parsed.plot.map((point, order) => `${order + 1}. ${point}`),
                        "",
                        `ENDING: ${parsed.ending || ""}`,
                        "",
                        "UNCERTAIN",
                        ...(parsed.uncertain || []).map((item) => `- ${item}`)
                    ].join("\n") + "\n", "utf-8");

                    return facts;
                }
            } catch (_error) {
                // retried below
            }
        }

        throw new Error("DeepSeek did not return the facts of the film.");
    }

    async writeStory({ angle, config, context, sceneCount }) {
        let messages = [...context, buildStoryMessage(config, sceneCount)];
        let draft = null;

        for (let attempt = 1; attempt <= 2 && !draft; attempt += 1) {
            console.log(`[Recap] ${angle}: writing the story (attempt ${attempt})`);

            const { text } = await DeepSeekService.chatJson({ messages, maxTokens: config.maxTokens || 4000 });

            try {
                const parsed = parseJsonFromText(text);
                const story = String(parsed.story || "").trim();

                if (story) {
                    draft = { text, story, title: parsed.title };
                }
            } catch (_error) {
                // retried below
            }
        }

        if (!draft) {
            throw new Error(`DeepSeek did not return a story for "${angle}".`);
        }

        messages = [...messages, { role: "assistant", content: draft.text }];

        if (config.maxSentenceWords) {
            const sentences = splitSentences(draft.story);
            const long = sentences.filter((sentence) => wordCount(sentence) > config.maxSentenceWords);

            if (long.length > sentences.length * MAX_LONG_SHARE) {
                console.log(`[Recap] ${angle}: ${long.length}/${sentences.length} sentences too long, tightening`);

                const tighten = buildTightenMessage(config, long.slice(0, 3));
                const { text } = await DeepSeekService.chatJson({
                    messages: [...messages, tighten],
                    maxTokens: config.maxTokens || 4000
                });

                try {
                    const parsed = parseJsonFromText(text);
                    const story = String(parsed.story || "").trim();

                    if (story) {
                        messages = [...messages, tighten, { role: "assistant", content: text }];
                        draft = { text, story, title: parsed.title || draft.title };
                    }
                } catch (_error) {
                    console.log(`[Recap] ${angle}: tightened story was not valid JSON; keeping the first draft.`);
                }
            }
        }

        return { messages, story: draft.story, title: draft.title };
    }

    // An existing <angle>_draft.txt is reused (and may be edited by hand); delete it to write a new story.
    async loadDraft({ angle, config, context, sceneCount, file }) {
        if (!fs.existsSync(file)) {
            return null;
        }

        const { title, story } = parseDraftFile(await fs.promises.readFile(file, "utf-8"));

        if (!story) {
            return null;
        }

        console.log(`[Recap] ${angle}: using the existing story in ${path.basename(file)} (delete it to write a new one).`);

        return {
            title,
            story,
            messages: [
                ...context,
                buildStoryMessage(config, sceneCount),
                { role: "assistant", content: JSON.stringify({ title, story }) }
            ]
        };
    }

    async pickFootage({ angle, draft, lines }) {
        const picks = new Map();
        const attempts = [];

        for (let start = 0; start < lines.length; start += FOOTAGE_BATCH) {
            const end = Math.min(lines.length, start + FOOTAGE_BATCH);
            const usedIds = [...picks.values()].flatMap((pick) => pick.moments);
            let messages = [...draft.messages, buildBeatsMessage({ lines, start, end, usedIds })];
            let batch = null;

            for (let attempt = 1; attempt <= MAX_ATTEMPTS && !batch; attempt += 1) {
                console.log(`[Recap] ${angle}: footage for lines ${start + 1}-${end} of ${lines.length} (attempt ${attempt})`);

                const { text, usage, finishReason } = await DeepSeekService.chatJson({
                    messages,
                    temperature: 0.4,
                    maxTokens: 4000
                });

                let entries = [];

                try {
                    entries = parseJsonFromText(text).beats || [];
                } catch (_error) {
                    entries = [];
                }

                const found = new Map(entries
                    .filter((entry) => (
                        Number(entry?.n) > start && Number(entry?.n) <= end &&
                        Array.isArray(entry.moments) && entry.moments.length
                    ))
                    .map((entry) => [Number(entry.n), { moments: entry.moments, shows: entry.shows || "" }]));

                const missing = [];

                for (let n = start + 1; n <= end; n += 1) {
                    if (!found.has(n)) {
                        missing.push(n);
                    }
                }

                attempts.push({ lines: `${start + 1}-${end}`, attempt, usage, finishReason, missing, raw: text });

                if (missing.length <= (end - start) * MAX_MISSING_SHARE) {
                    batch = found;
                } else {
                    console.log(`[Recap] ${angle}: ${missing.length} lines got no footage; asking again.`);
                    messages = [...messages, { role: "assistant", content: text }, buildMissingLinesMessage(missing)];
                }
            }

            if (!batch) {
                throw new Error(`DeepSeek did not pick footage for lines ${start + 1}-${end} of "${angle}".`);
            }

            batch.forEach((pick, n) => picks.set(n, pick));
        }

        return { picks, attempts };
    }

    async writeAngle({ jobId, title, angle, context, index, sceneById }) {
        const config = ANGLES[angle];
        const files = this.anglePaths(jobId, angle);
        const sceneCount = index.scenes.length;
        const draft = await this.loadDraft({ angle, config, context, sceneCount, file: files.draft }) ||
            await this.writeStory({ angle, config, context, sceneCount });

        await fs.promises.writeFile(files.draft, draftFileText(draft.title || title, draft.story), "utf-8");

        const lines = splitLines(draft.story, config.maxBeats);
        const { picks, attempts } = await this.pickFootage({ angle, draft, lines });

        await writeJson(files.attempts, attempts);

        const accepted = validateRecap({
            parsed: {
                beats: lines.map((text, order) => ({
                    text,
                    moments: picks.get(order + 1)?.moments || [],
                    shows: picks.get(order + 1)?.shows || ""
                }))
            },
            index,
            angle: config
        });

        accepted.fixes.forEach((fix) => console.log(`[Recap] ${angle}: fixed: ${fix}`));

        if (accepted.errors.length) {
            throw new Error(`Footage for "${angle}" is unusable: ${accepted.errors.join(" ")}`);
        }

        const beats = accepted.beats.map((beat, order) => ({
            beat_id: beatId(order),
            text: beat.text,
            shows: beat.shows,
            moments: beat.moments.map((moment) => ({
                id: moment.id,
                scene_id: moment.scene_id,
                time_sec: moment.time_sec,
                clock: moment.clock,
                shot: moment.shot,
                shows: moment.shows
            })),
            scenes: beat.scenes.map((id) => {
                const scene = sceneById.get(id);

                return {
                    id,
                    start_sec: scene.start_sec,
                    end_sec: scene.end_sec,
                    start_clock: scene.start_clock,
                    end_clock: scene.end_clock,
                    caption: scene.caption
                };
            })
        }));

        const recap = {
            angle,
            label: config.label,
            title: String(draft.title || title).trim(),
            movie: title,
            draft: draft.story,
            story: beats.map((beat) => beat.text).join("\n"),
            beats
        };

        await writeJson(files.recap, recap);
        await fs.promises.writeFile(
            files.story,
            beats.map((beat) => (
                `${beat.beat_id} [${beat.moments.map((moment) => moment.id).join(", ")}] ${beat.text}\n    shows: ${beat.shows}`
            )).join("\n") + "\n",
            "utf-8"
        );

        console.log(`[Recap] ${angle}: ${beats.length} beats accepted.`);

        return recap;
    }
}

module.exports = new RecapService();
