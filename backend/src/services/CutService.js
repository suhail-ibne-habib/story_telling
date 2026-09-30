const fs = require("fs");
const path = require("path");

const StorageService = require("../../storage/StorageService");
const GetFileName = require("../core/GetFileName");
const FFmpegService = require("./FFmpegService");
const FFprobeService = require("./FFprobeService");
const MovieIndexService = require("./MovieIndexService");
const RecapService = require("./RecapService");
const VoiceoverService = require("./VoiceoverService");
const VoiceGenerationService = require("./VoiceGenerationService");
const ClipVerifyService = require("./ClipVerifyService");
const DeepSeekService = require("./DeepSeekService");
const { ANGLES } = require("../constance/recapAngles");
const { buildRewriteMessages } = require("./RecapPromptBuilder");
const { formatClockHms } = require("./TimeService");
const { readJson, writeJson, parseJsonFromText } = require("../utils/jsonFile");

const TAIL_SEC = 0.3;
const EDGE_SEC = 0.05;
const OVERLAP_SEC = 0.5;
const SAME_WINDOW_SEC = 0.5;
const MIN_PART_SEC = 2;
const MAX_PARTS = 3;
const PART_CHECKS = 2;

function maxChecks() {
    const configured = Number(process.env.VERIFY_MAX_CHECKS);
    return Number.isInteger(configured) && configured > 0 ? configured : 4;
}

function rewriteEnabled() {
    return process.env.REWRITE_UNMATCHED === "true";
}

function round(value) {
    return Number(value.toFixed(3));
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

function relative(jobId, filePath) {
    return path.relative(StorageService.getPaths(jobId).root, filePath).replace(/\\/g, "/");
}

function overlaps(window, used) {
    return used.some((range) => (
        Math.min(window.end_sec, range.end_sec) - Math.max(window.start_sec, range.start_sec) > OVERLAP_SEC
    ));
}

function distinctShots(moments) {
    return (moments || []).filter((moment, position, all) => (
        all.findIndex((other) => other.scene_id === moment.scene_id && other.shot === moment.shot) === position
    ));
}

function passed(attempt) {
    return attempt.score != null && attempt.score >= ClipVerifyService.passScore;
}

class CutService {

    cutPaths(jobId, angle) {
        const cutDir = StorageService.getPaths(jobId).cut;

        return {
            dir: path.join(cutDir, angle),
            frames: path.join(cutDir, angle, "frames"),
            manifest: path.join(cutDir, `${angle}.json`),
            progress: path.join(cutDir, `${angle}.progress.json`)
        };
    }

    // Beats finished by an earlier run that crashed part-way, kept only while the recap and voiceover are unchanged.
    async loadProgress(jobId, files, voice, recapCreatedAt) {
        const saved = await readJson(files.progress).catch(() => null);

        if (!saved || saved.story !== voice.story || saved.recap_created_at !== recapCreatedAt || !Array.isArray(saved.beats)) {
            return [];
        }

        const root = StorageService.getPaths(jobId).root;
        const kept = [];

        for (const [order, beat] of saved.beats.entries()) {
            const current = voice.beats[order];
            const same = current &&
                beat.beat_id === current.beat_id &&
                beat.original_text === current.text &&
                beat.audio === current.audio &&
                beat.duration_sec === current.duration_sec &&
                fs.existsSync(path.join(root, beat.clip));

            if (!same) {
                break;
            }

            kept.push(beat);
        }

        return kept;
    }

    async loadAngle(jobId, angle) {
        return readJson(this.cutPaths(jobId, angle).manifest);
    }

    // "shot": the moment's shot plays from its start (or centred on the moment if the shot is long enough).
    // "centre": centred on the moment itself, crossing cuts if needed.
    windowFor({ moment, scene, durationSec, variant, movieEnd }) {
        const shot = (scene.shots || []).find((item) => item.index === moment.shot);
        const latestStart = movieEnd - durationSec;
        let start;

        if (variant === "shot" && shot) {
            const length = shot.end_sec - shot.start_sec;
            start = length >= durationSec
                ? clamp(moment.time_sec - durationSec / 2, shot.start_sec, shot.end_sec - durationSec)
                : shot.start_sec;
        } else {
            start = moment.time_sec - durationSec / 2;
        }

        start = clamp(start, 0, latestStart);
        const end = start + durationSec;
        const cuts = (scene.shots || []).filter((item) => (
            item.start_sec > start + EDGE_SEC && item.start_sec < end - EDGE_SEC
        )).length;

        return {
            moment_id: moment.id,
            scene_id: scene.id,
            variant,
            anchor_sec: moment.time_sec,
            start_sec: round(start),
            end_sec: round(end),
            start_clock: formatClockHms(start * 1000),
            end_clock: formatClockHms(end * 1000),
            cuts
        };
    }

    // Shot-aligned windows of every given moment first, then moment-centred ones; windows over footage
    // already used go last.
    candidatesFor({ beatId, moments, sceneById, durationSec, movieEnd, used }) {
        if (!Array.isArray(moments) || !moments.length) {
            throw new Error(`${beatId} has no cited moments. Re-run the recap stage with the current index.`);
        }

        const windows = [];

        for (const variant of ["shot", "centre"]) {
            moments.forEach((moment) => {
                const scene = sceneById.get(moment.scene_id);

                if (!scene) {
                    throw new Error(`${beatId} cites ${moment.id}, which is not in the movie index.`);
                }

                const window = this.windowFor({ moment, scene, durationSec, variant, movieEnd });
                const duplicate = windows.some((other) => Math.abs(other.start_sec - window.start_sec) < SAME_WINDOW_SEC);

                if (!duplicate) {
                    windows.push(window);
                }
            });
        }

        return [
            ...windows.filter((window) => !overlaps(window, used)),
            ...windows.filter((window) => overlaps(window, used))
        ];
    }

    // A line citing moments from different shots plays one shot per moment, sharing the line's time.
    // Returns null when the line is a single shot (too short to split, or one shot cited).
    planParts(beat, clipDuration) {
        const moments = distinctShots(beat.moments);
        const count = Math.min(moments.length, MAX_PARTS, Math.floor(clipDuration / MIN_PART_SEC));

        if (count < 2) {
            return null;
        }

        const fragments = String(beat.shows || "").split(";").map((part) => part.trim()).filter(Boolean);
        const share = round(clipDuration / count);

        return moments.slice(0, count).map((moment, order) => ({
            moment,
            durationSec: order === count - 1 ? round(clipDuration - share * (count - 1)) : share,
            shows: fragments.length === count ? fragments[order] : (moment.shows || beat.shows)
        }));
    }

    async check({ moviePath, window, text, shows, framesDir, name }) {
        const result = await ClipVerifyService.score({ moviePath, window, text, shows, framesDir, name });

        console.log(
            `[Cut] ${name} ${window.moment_id} ${window.start_clock} score ${result.score ?? "n/a"}: ${result.reason}`
        );

        return {
            ...window,
            score: result.score,
            visible: result.visible,
            missing: result.missing,
            reason: result.reason,
            blocked: Boolean(result.blocked)
        };
    }

    async chooseWindow({ moviePath, candidates, text, shows, framesDir, name, limit }) {
        if (!ClipVerifyService.enabled) {
            return {
                chosen: { ...candidates[0], score: null, reason: "Vision check disabled." },
                tried: [],
                passed: true
            };
        }

        const tried = [];

        for (const [order, candidate] of candidates.slice(0, limit).entries()) {
            const attempt = await this.check({
                moviePath,
                window: candidate,
                text,
                shows,
                framesDir,
                name: `${name}_c${order + 1}`
            });

            tried.push(attempt);

            if (passed(attempt)) {
                return { chosen: attempt, tried, passed: true };
            }
        }

        const best = tried.reduce((top, attempt) => (
            (attempt.score ?? -1) > (top.score ?? -1) ? attempt : top
        ), tried[0]);

        return { chosen: best, tried, passed: false };
    }

    async chooseParts({ moviePath, beat, plan, sceneById, movieEnd, used, framesDir }) {
        const parts = [];
        const tried = [];

        for (const [order, part] of plan.entries()) {
            const candidates = this.candidatesFor({
                beatId: beat.beat_id,
                moments: [part.moment],
                sceneById,
                durationSec: part.durationSec,
                movieEnd,
                used: [...used, ...parts.map((done) => ({ start_sec: done.start_sec, end_sec: done.start_sec + done.duration_sec }))]
            });
            const selection = await this.chooseWindow({
                moviePath,
                candidates,
                text: beat.text,
                shows: part.shows,
                framesDir,
                name: `${beat.beat_id}_p${order + 1}`,
                limit: PART_CHECKS
            });

            tried.push(...selection.tried);
            parts.push({ ...selection.chosen, duration_sec: part.durationSec, shows: part.shows, passed: selection.passed });
        }

        return { parts, tried };
    }

    summarize(parts) {
        if (parts.length === 1) {
            return parts[0];
        }

        const first = parts[0];
        const last = parts[parts.length - 1];
        const scores = parts.map((part) => part.score);

        return {
            moment_id: parts.map((part) => part.moment_id).join(" + "),
            scene_id: first.scene_id,
            variant: "parts",
            start_sec: first.start_sec,
            end_sec: last.end_sec,
            start_clock: first.start_clock,
            end_clock: last.end_clock,
            score: scores.some((score) => score == null) ? null : Math.min(...scores),
            visible: parts.map((part) => part.visible).filter(Boolean).join("; "),
            reason: parts.map((part) => `${part.moment_id} [${part.score ?? "n/a"}] ${part.reason}`).join(" | ")
        };
    }

    async cutClip({ moviePath, parts, clipPath }) {
        if (parts.length === 1) {
            await FFmpegService.cutVideo({
                inputPath: moviePath,
                outputPath: clipPath,
                startSec: parts[0].start_sec,
                durationSec: parts[0].duration_sec
            });
            return;
        }

        const base = clipPath.replace(/\.mp4$/, "");
        const pieces = parts.map((_, order) => `${base}_p${order + 1}.mp4`);
        const listPath = `${base}_parts.txt`;

        for (const [order, part] of parts.entries()) {
            await FFmpegService.cutVideo({
                inputPath: moviePath,
                outputPath: pieces[order],
                startSec: part.start_sec,
                durationSec: part.duration_sec
            });
        }

        await fs.promises.writeFile(
            listPath,
            pieces.map((piece) => `file '${piece.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n",
            "utf-8"
        );
        await FFmpegService.concat({ listPath, outputPath: clipPath });
        await Promise.all([...pieces, listPath].map((file) => fs.promises.rm(file, { force: true })));
    }

    // Nothing matched the line: change the line to fit the best footage instead of keeping a wrong clip.
    async rewriteBeat({ moviePath, beat, best, angle, previousText, nextText, files, sceneById, movieEnd }) {
        const config = ANGLES[angle];
        const { text: raw } = await DeepSeekService.chatJson({
            messages: buildRewriteMessages({
                angle: config,
                previous: previousText,
                text: beat.text,
                next: nextText,
                visible: best.visible
            }),
            temperature: 0.5,
            maxTokens: 300
        });

        const text = String(parseJsonFromText(raw)?.text || "").replace(/\s+/g, " ").trim();

        if (!text) {
            return null;
        }

        const audioPath = path.join(files.dir, `${beat.beat_id}_rewrite.mp3`);
        await VoiceGenerationService.generate({ text, outputPath: audioPath });

        const durationSec = round(await FFprobeService.durationSeconds(audioPath));
        const clipDuration = round(durationSec + TAIL_SEC);
        const moment = beat.moments.find((item) => item.id === best.moment_id);
        const window = this.windowFor({
            moment,
            scene: sceneById.get(best.scene_id),
            durationSec: clipDuration,
            variant: best.variant,
            movieEnd
        });

        const checked = await this.check({
            moviePath,
            window,
            text,
            shows: best.visible,
            framesDir: files.frames,
            name: `${beat.beat_id}_rewrite`
        });

        console.log(`[Cut] ${angle} ${beat.beat_id} rewritten: "${text}"`);

        return { text, audioPath, durationSec, clipDuration, chosen: checked };
    }

    async cut(jobId) {
        const manifest = await RecapService.loadManifest(jobId);
        const filename = await GetFileName.getFileName(jobId);
        const moviePath = StorageService.getInputMovie(filename);
        const index = await MovieIndexService.load(filename);

        if (!fs.existsSync(moviePath)) {
            throw new Error(`Input movie not found: ${moviePath}`);
        }

        if (!index?.complete) {
            throw new Error(`Movie index is not ready for ${filename}.`);
        }

        const sceneById = new Map(index.scenes.map((scene) => [scene.id, scene]));
        const movieEnd = index.movie.duration_sec;
        const results = [];

        for (const angle of manifest.angles) {
            const voice = await VoiceoverService.loadAngle(jobId, angle);
            const recap = await RecapService.loadAngle(jobId, angle);
            const recapById = new Map(recap.beats.map((beat) => [beat.beat_id, beat]));
            const files = this.cutPaths(jobId, angle);
            const used = [];

            await fs.promises.mkdir(files.frames, { recursive: true });

            const beats = await this.loadProgress(jobId, files, voice, manifest.created_at);

            beats.forEach((done) => {
                (done.parts || [{ ...done.chosen, duration_sec: done.clip_duration_sec }]).forEach((part) => {
                    used.push({ start_sec: part.start_sec, end_sec: part.start_sec + part.duration_sec });
                });
            });

            if (beats.length) {
                console.log(`[Cut] ${angle}: resuming after ${beats.length} finished beats.`);
            }

            for (const [order, voiced] of voice.beats.entries()) {
                if (order < beats.length) {
                    continue;
                }

                // Footage comes from the recap: it can be re-picked (e.g. after an index rebuild) without new audio.
                const picked = recapById.get(voiced.beat_id);
                const beat = picked
                    ? { ...voiced, shows: picked.shows, moments: picked.moments, scenes: picked.scenes }
                    : voiced;

                let text = beat.text;
                let audio = beat.audio;
                let durationSec = beat.duration_sec;
                let clipDuration = round(durationSec + TAIL_SEC);
                let parts;
                let tried;
                let rewritten = false;

                const plan = this.planParts(beat, clipDuration);

                if (plan) {
                    ({ parts, tried } = await this.chooseParts({
                        moviePath,
                        beat,
                        plan,
                        sceneById,
                        movieEnd,
                        used,
                        framesDir: files.frames
                    }));
                } else {
                    const selection = await this.chooseWindow({
                        moviePath,
                        candidates: this.candidatesFor({
                            beatId: beat.beat_id,
                            moments: beat.moments,
                            sceneById,
                            durationSec: clipDuration,
                            movieEnd,
                            used
                        }),
                        text: beat.text,
                        shows: beat.shows,
                        framesDir: files.frames,
                        name: beat.beat_id,
                        limit: maxChecks()
                    });

                    parts = [{ ...selection.chosen, duration_sec: clipDuration, shows: beat.shows, passed: selection.passed }];
                    tried = selection.tried;

                    const chosen = selection.chosen;

                    if (!selection.passed && rewriteEnabled() && chosen.score != null && chosen.visible) {
                        const rewrite = await this.rewriteBeat({
                            moviePath,
                            beat,
                            best: chosen,
                            angle,
                            previousText: beats[order - 1]?.text || null,
                            nextText: voice.beats[order + 1]?.text || null,
                            files,
                            sceneById,
                            movieEnd
                        });

                        if (rewrite && (rewrite.chosen.score ?? -1) >= (chosen.score ?? -1)) {
                            text = rewrite.text;
                            audio = relative(jobId, rewrite.audioPath);
                            durationSec = rewrite.durationSec;
                            clipDuration = rewrite.clipDuration;
                            parts = [{
                                ...rewrite.chosen,
                                duration_sec: clipDuration,
                                shows: rewrite.chosen.visible,
                                passed: passed(rewrite.chosen)
                            }];
                            rewritten = true;
                            tried.push(rewrite.chosen);
                        }
                    }
                }

                const chosen = this.summarize(parts);
                const needsReview = parts.some((part) => !part.passed);
                const clipPath = path.join(files.dir, `${beat.beat_id}.mp4`);

                await this.cutClip({ moviePath, parts, clipPath });

                parts.forEach((part) => {
                    used.push({ start_sec: part.start_sec, end_sec: part.start_sec + part.duration_sec });
                });

                console.log(
                    `[Cut] ${angle} ${beat.beat_id} → ${chosen.moment_id} ${chosen.start_clock}` +
                    (parts.length > 1 ? ` (${parts.length} shots)` : "") +
                    (rewritten ? " (line rewritten)" : "") +
                    (needsReview ? " (needs review)" : "")
                );

                beats.push({
                    beat_id: beat.beat_id,
                    text,
                    original_text: beat.text,
                    rewritten,
                    shows: beat.shows,
                    moments: beat.moments,
                    scenes: beat.scenes,
                    audio,
                    duration_sec: durationSec,
                    clip_duration_sec: clipDuration,
                    chosen,
                    parts,
                    tried,
                    needs_review: needsReview,
                    clip: relative(jobId, clipPath)
                });

                await writeJson(files.progress, { story: voice.story, recap_created_at: manifest.created_at, beats });
            }

            const payload = {
                angle,
                label: voice.label,
                title: voice.title,
                story: voice.story,
                recap_created_at: manifest.created_at,
                created_at: new Date().toISOString(),
                final_story: beats.map((beat) => beat.text).join("\n"),
                verified: ClipVerifyService.enabled,
                rewritten: beats.filter((beat) => beat.rewritten).map((beat) => beat.beat_id),
                needs_review: beats.filter((beat) => beat.needs_review).map((beat) => beat.beat_id),
                beats
            };

            await writeJson(files.manifest, payload);
            await fs.promises.rm(files.progress, { force: true });
            results.push(payload);
        }

        return results;
    }

    async isDone(jobId) {
        const manifest = await RecapService.loadManifest(jobId).catch(() => null);

        if (!manifest?.angles?.length) {
            return false;
        }

        const root = StorageService.getPaths(jobId).root;

        for (const angle of manifest.angles) {
            const voice = await VoiceoverService.loadAngle(jobId, angle).catch(() => null);
            const cut = await this.loadAngle(jobId, angle).catch(() => null);

            const ready = voice && cut &&
                cut.story === voice.story &&
                cut.recap_created_at === manifest.created_at &&
                cut.beats?.length === voice.beats.length &&
                cut.beats.every((beat) => (
                    fs.existsSync(path.join(root, beat.clip)) &&
                    fs.existsSync(path.join(root, beat.audio))
                ));

            if (!ready) {
                return false;
            }
        }

        return true;
    }
}

module.exports = new CutService();
