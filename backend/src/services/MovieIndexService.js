const fs = require("fs");
const path = require("path");

const StorageService = require("../../storage/StorageService");
const FFprobeService = require("./FFprobeService");
const FFmpegService = require("./FFmpegService");
const SceneGroupingService = require("./SceneGroupingService");
const SceneCaptionService = require("./SceneCaptionService");
const { formatClockHms } = require("./TimeService");
const { runPython } = require("../utils/PythonRunner");
const { readJson, writeJson } = require("../utils/jsonFile");

const INDEX_VERSION = 3;
const MAX_CONSECUTIVE_CAPTION_FAILURES = 3;
const SAMPLE_STEP_SEC = 3;
const MAX_SAMPLES_PER_SCENE = 24;
const MAX_TILES = 16;
const MIN_SAMPLE_SHOT_SEC = 0.3;

function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return hours ? `${hours}h${String(minutes).padStart(2, "0")}m` : `${minutes}m${total % 60}s`;
}

function round(value) {
    return Number(value.toFixed(3));
}

function pickEvenly(items, limit) {
    if (items.length <= limit) {
        return items;
    }

    const step = (items.length - 1) / (limit - 1);
    return Array.from({ length: limit }, (_, order) => items[Math.round(order * step)]);
}

// One frame per shot (more for long shots); the Python script drops near-duplicates.
function sampleScene(scene, shotsByIndex) {
    const samples = [];

    scene.shots.forEach((shotIndex) => {
        const shot = shotsByIndex.get(shotIndex);

        if (!shot) {
            return;
        }

        const start = Math.max(shot.start_sec, scene.start_sec);
        const end = Math.min(shot.end_sec, scene.end_sec);
        const length = end - start;

        if (length < MIN_SAMPLE_SHOT_SEC) {
            return;
        }

        const count = Math.max(1, Math.round(length / SAMPLE_STEP_SEC));

        for (let part = 0; part < count; part += 1) {
            samples.push({ time_sec: round(start + length * (part + 0.5) / count), shot: shotIndex });
        }
    });

    if (!samples.length) {
        samples.push({ time_sec: round((scene.start_sec + scene.end_sec) / 2), shot: scene.shots[0] ?? null });
    }

    return pickEvenly(samples, MAX_SAMPLES_PER_SCENE);
}

function momentId(sceneId, tile) {
    return `${sceneId}.${tile}`;
}

class MovieIndexService {

    constructor() {
        this.root = path.join(process.cwd(), "storage", "index");
        this.building = new Map();
    }

    keyFor(filename) {
        return path.parse(filename).name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || "movie";
    }

    getPaths(filename) {
        const dir = path.join(this.root, this.keyFor(filename));

        return {
            dir,
            source: path.join(dir, "source.json"),
            subtitles: path.join(dir, "subtitles.json"),
            dialogue: path.join(dir, "dialogue.wav"),
            shots: path.join(dir, "shots.json"),
            scenes: path.join(dir, "scenes.json"),
            sheetJobs: path.join(dir, "sheet_jobs.json"),
            sheets: path.join(dir, `grids_v${INDEX_VERSION}`),
            tiles: path.join(dir, `grids_v${INDEX_VERSION}`, "tiles.json"),
            captions: path.join(dir, `scene_notes_v${INDEX_VERSION}.json`),
            index: path.join(dir, "movie_index.json"),
            lines: path.join(dir, "index_lines.txt")
        };
    }

    async load(filename) {
        const file = this.getPaths(filename).index;
        return fs.existsSync(file) ? readJson(file) : null;
    }

    async isReady(filename) {
        const index = await this.load(filename).catch(() => null);
        return Boolean(index?.complete && index.version === INDEX_VERSION);
    }

    build(filename) {
        const key = this.keyFor(filename);

        if (!this.building.has(key)) {
            this.building.set(
                key,
                this.buildIndex(filename).finally(() => this.building.delete(key))
            );
        }

        return this.building.get(key);
    }

    async buildIndex(filename) {
        const moviePath = StorageService.getInputMovie(filename);

        if (!fs.existsSync(moviePath)) {
            throw new Error(`Input movie not found: ${moviePath}`);
        }

        const paths = this.getPaths(filename);
        await fs.promises.mkdir(paths.sheets, { recursive: true });

        const source = await this.ensureSource(filename, moviePath, paths);
        console.log(`[Index] ${filename} → ${paths.dir}`);

        if (!fs.existsSync(paths.subtitles)) {
            const audio = await this.dialogueAudio(moviePath, paths);
            console.log(`[Index] Transcribing dialogue (Whisper, ${audio.label})...`);
            await runPython(
                "transcribe.py",
                [audio.path, paths.subtitles, ...(audio.whisperLanguage ? ["--language", audio.whisperLanguage] : [])],
                { label: "Whisper" }
            );
        } else {
            console.log("[Index] Transcript cached.");
        }

        if (!fs.existsSync(paths.shots)) {
            console.log("[Index] Detecting shots (PySceneDetect)...");
            await runPython("detect_shots.py", [moviePath, paths.shots], { label: "Shots" });
        } else {
            console.log("[Index] Shots cached.");
        }

        const subtitles = await readJson(paths.subtitles);
        const shotsFile = await readJson(paths.shots);
        const shots = shotsFile.shots || [];

        if (!shots.length) {
            throw new Error(`No shots detected for ${filename}`);
        }

        const shotsByIndex = new Map(shots.map((shot) => [shot.index, shot]));
        const scenes = SceneGroupingService
            .group(shots, subtitles.segments || [])
            .map((scene) => ({
                ...scene,
                sheet: `${scene.id}_${Math.round(scene.start_sec * 1000)}.jpg`
            }));

        await writeJson(paths.scenes, scenes);
        console.log(`[Index] ${shots.length} shots grouped into ${scenes.length} scenes.`);

        await writeJson(paths.sheetJobs, scenes.map((scene) => ({
            id: scene.id,
            sheet: scene.sheet,
            samples: sampleScene(scene, shotsByIndex)
        })));

        console.log("[Index] Building labelled contact sheets...");
        await runPython(
            "scene_sheets.py",
            [moviePath, paths.sheetJobs, paths.sheets, "--max-tiles", String(MAX_TILES)],
            { label: "Sheets" }
        );

        const tiles = await readJson(paths.tiles);
        const missingSheets = scenes.filter((scene) => !tiles[scene.sheet]?.length);

        if (missingSheets.length) {
            throw new Error(
                `No contact sheet for ${missingSheets.map((scene) => scene.id).join(", ")}.`
            );
        }

        const captions = await this.captionScenes(scenes, tiles, paths);

        const index = {
            version: INDEX_VERSION,
            complete: true,
            built_at: new Date().toISOString(),
            movie: {
                filename,
                duration_sec: source.duration_sec,
                size_bytes: source.size_bytes
            },
            transcript: {
                engine: subtitles.engine || null,
                model: subtitles.model || null,
                segments: (subtitles.segments || []).length
            },
            captioner: {
                provider: "gemini",
                model: SceneCaptionService.model
            },
            shot_count: shots.length,
            scenes: scenes.map((scene) => {
                const notes = captions.items[scene.sheet];
                const notesByTile = new Map(notes.moments.map((moment) => [moment.tile, moment]));
                const moments = tiles[scene.sheet].map((tile) => ({
                    id: momentId(scene.id, tile.tile),
                    tile: tile.tile,
                    time_sec: tile.time_sec,
                    clock: formatClockHms(tile.time_sec * 1000),
                    shot: tile.shot,
                    shows: notesByTile.get(tile.tile)?.shows || "",
                    text_only: Boolean(notesByTile.get(tile.tile)?.text_only)
                }));

                return {
                    id: scene.id,
                    start_sec: scene.start_sec,
                    end_sec: scene.end_sec,
                    duration_sec: round(scene.end_sec - scene.start_sec),
                    start_clock: formatClockHms(scene.start_sec * 1000),
                    end_clock: formatClockHms(scene.end_sec * 1000),
                    caption: notes.summary,
                    caption_blocked: Boolean(notes.blocked),
                    text_only: moments.every((moment) => moment.text_only),
                    moments,
                    dialogue: scene.dialogue,
                    sheet: `${path.basename(paths.sheets)}/${scene.sheet}`,
                    shots: scene.shots
                        .map((shotIndex) => shotsByIndex.get(shotIndex))
                        .filter(Boolean)
                        .map((shot) => ({
                            index: shot.index,
                            start_sec: shot.start_sec,
                            end_sec: shot.end_sec
                        }))
                };
            })
        };

        await writeJson(paths.index, index);
        await fs.promises.writeFile(paths.lines, this.toLines(index), "utf-8");
        console.log(`[Index] Saved ${paths.index}`);

        return index;
    }

    // Multi-audio files (e.g. Hindi + English) default to the wrong track; transcribe the wanted language.
    async dialogueAudio(moviePath, paths) {
        const wanted = (process.env.AUDIO_LANGUAGE || "eng").toLowerCase();
        const streams = await FFprobeService.audioStreams(moviePath);

        if (streams.length <= 1) {
            return { path: moviePath, label: streams[0]?.language || "single audio track", whisperLanguage: null };
        }

        const chosen = streams.find((stream) => stream.language === wanted) ||
            streams.find((stream) => stream.isDefault) ||
            streams[0];

        console.log(
            `[Index] Audio tracks: ${streams.map((stream) => stream.language || "unknown").join(", ")}; using ${chosen.language || `track ${chosen.order + 1}`}.`
        );

        await FFmpegService.extractAudio({ inputPath: moviePath, outputPath: paths.dialogue, audioOrder: chosen.order });

        return {
            path: paths.dialogue,
            label: chosen.language || `track ${chosen.order + 1}`,
            whisperLanguage: chosen.language === "eng" ? "en" : null
        };
    }

    async ensureSource(filename, moviePath, paths) {
        const stat = await fs.promises.stat(moviePath);
        const existing = fs.existsSync(paths.source)
            ? await readJson(paths.source).catch(() => null)
            : null;

        if (existing && existing.size_bytes !== stat.size) {
            console.log(`[Index] ${filename} changed on disk. Rebuilding index from scratch.`);
            await fs.promises.rm(paths.dir, { recursive: true, force: true });
            await fs.promises.mkdir(paths.sheets, { recursive: true });
        } else if (existing) {
            return existing;
        }

        const source = {
            filename,
            size_bytes: stat.size,
            duration_sec: await FFprobeService.durationSeconds(moviePath)
        };

        await writeJson(paths.source, source);
        return source;
    }

    async captionScenes(scenes, tiles, paths) {
        const captions = fs.existsSync(paths.captions)
            ? await readJson(paths.captions)
            : { items: {} };
        captions.items = captions.items || {};

        const isDescribed = (scene) => {
            const notes = captions.items[scene.sheet];
            return Boolean(notes?.summary) && notes.moments?.length === tiles[scene.sheet].length;
        };

        const pending = scenes.filter((scene) => !isDescribed(scene));

        if (!pending.length) {
            console.log("[Index] Captions cached.");
            return captions;
        }

        const model = SceneCaptionService.model;
        const workers = Math.min(SceneCaptionService.concurrency, pending.length);

        console.log(
            `[Index] Captioning ${pending.length}/${scenes.length} scenes with Gemini (${model}), ${workers} at a time...`
        );

        const started = Date.now();
        let done = 0;
        let consecutiveFailures = 0;
        let fatal = null;
        let saving = Promise.resolve();
        const queue = [...pending];

        const save = () => {
            saving = saving.then(() => writeJson(paths.captions, captions));
            return saving;
        };

        const worker = async () => {
            while (queue.length && !fatal) {
                const scene = queue.shift();

                try {
                    const result = await SceneCaptionService.describe({
                        imagePath: path.join(paths.sheets, scene.sheet),
                        startSec: scene.start_sec,
                        endSec: scene.end_sec,
                        tiles: tiles[scene.sheet]
                    });
                    const caption = result.summary;

                    captions.items[scene.sheet] = {
                        id: scene.id,
                        summary: result.summary,
                        moments: result.moments,
                        model,
                        blocked: result.blocked
                    };
                    consecutiveFailures = 0;
                    done += 1;
                    await save();

                    const elapsed = (Date.now() - started) / 1000;
                    const eta = (elapsed / done) * (pending.length - done);
                    console.log(
                        `[Index] ${scene.id} (${done}/${pending.length}, eta ${formatDuration(eta)}): ${caption}`
                    );
                } catch (error) {
                    consecutiveFailures += 1;
                    console.error(`[Index] Caption failed for ${scene.id}: ${error.message}`);

                    if (consecutiveFailures >= MAX_CONSECUTIVE_CAPTION_FAILURES) {
                        fatal = error;
                    }
                }
            }
        };

        await Promise.all(Array.from({ length: workers }, worker));
        await saving;

        const missing = scenes.filter((scene) => !isDescribed(scene));

        if (missing.length) {
            throw new Error(
                `${missing.length} scenes still have no caption (${fatal ? fatal.message : "see log"}). ` +
                "Re-run to resume; finished captions are kept."
            );
        }

        return captions;
    }

    toLines(index) {
        return index.scenes.map((scene) => {
            const lines = [`${scene.id} ${scene.start_clock}-${scene.end_clock} | ${scene.caption}`];

            scene.moments.forEach((moment) => {
                const shows = scene.caption_blocked
                    ? "[not described: vision filter]"
                    : moment.text_only
                        ? `[text] ${moment.shows}`
                        : moment.shows;

                lines.push(`  ${moment.id} ${moment.clock} ${shows}`);
            });

            if (scene.dialogue) {
                lines.push(`  dialogue: "${scene.dialogue}"`);
            }

            return lines.join("\n");
        }).join("\n") + "\n";
    }

    momentsById(index) {
        const moments = new Map();

        index.scenes.forEach((scene) => {
            scene.moments.forEach((moment) => moments.set(moment.id, { ...moment, scene_id: scene.id }));
        });

        return moments;
    }
}

module.exports = new MovieIndexService();
