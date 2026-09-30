const DEFAULTS = {
    minSec: 15,
    targetSec: 30,
    maxSec: 50,
    splitChunkSec: 35,
    speechGuardSec: 0.5
};

class SceneGroupingService {

    splitLongShots(shots, options) {
        const pieces = [];

        for (const shot of shots) {
            const start = Number(shot.start_sec);
            const end = Number(shot.end_sec);
            const duration = end - start;

            if (!(duration > 0)) {
                continue;
            }

            if (duration <= options.maxSec) {
                pieces.push({ shot: shot.index, start, end });
                continue;
            }

            const parts = Math.ceil(duration / options.splitChunkSec);
            const step = duration / parts;

            for (let part = 0; part < parts; part += 1) {
                pieces.push({
                    shot: shot.index,
                    start: start + step * part,
                    end: part === parts - 1 ? end : start + step * (part + 1)
                });
            }
        }

        return pieces;
    }

    speechCrosses(time, segments, guard) {
        return segments.some((segment) => (
            segment.start < time - guard &&
            segment.end > time + guard
        ));
    }

    group(shots, segments = [], overrides = {}) {
        const options = { ...DEFAULTS, ...overrides };
        const pieces = this.splitLongShots(
            [...shots].sort((a, b) => a.start_sec - b.start_sec),
            options
        );
        const speech = segments
            .map((segment) => ({
                start: Number(segment.start),
                end: Number(segment.end),
                text: String(segment.text || "").trim()
            }))
            .filter((segment) => segment.end > segment.start && segment.text);

        const groups = [];
        let current = null;

        pieces.forEach((piece, index) => {
            if (!current) {
                current = { start: piece.start, end: piece.end, shots: [] };
            }

            current.end = piece.end;
            if (!current.shots.includes(piece.shot)) {
                current.shots.push(piece.shot);
            }

            const next = pieces[index + 1];

            if (!next) {
                return;
            }

            const duration = current.end - current.start;
            const nextDuration = next.end - next.start;
            const midSpeech = this.speechCrosses(
                current.end,
                speech,
                options.speechGuardSec
            );

            const close =
                duration >= options.maxSec ||
                (duration >= options.targetSec && !midSpeech) ||
                (duration >= options.minSec && duration + nextDuration > options.maxSec);

            if (close) {
                groups.push(current);
                current = null;
            }
        });

        if (current) {
            const previous = groups[groups.length - 1];

            if (previous && current.end - current.start < options.minSec / 2) {
                previous.end = current.end;
                current.shots.forEach((shot) => {
                    if (!previous.shots.includes(shot)) {
                        previous.shots.push(shot);
                    }
                });
            } else {
                groups.push(current);
            }
        }

        return groups.map((group, index) => ({
            id: `S${String(index + 1).padStart(3, "0")}`,
            start_sec: Number(group.start.toFixed(3)),
            end_sec: Number(group.end.toFixed(3)),
            shots: group.shots,
            dialogue: this.dialogueFor(group, speech)
        }));
    }

    dialogueFor(group, speech) {
        return speech
            .filter((segment) => {
                const middle = (segment.start + segment.end) / 2;
                return middle >= group.start && middle < group.end;
            })
            .map((segment) => segment.text)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
    }
}

module.exports = new SceneGroupingService();
