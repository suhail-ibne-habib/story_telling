const MAX_MOMENTS_PER_BEAT = 3;
const MAX_UNPICKED_SHARE = 0.25;

function normalizeSceneId(value) {
    const match = String(value || "").trim().toUpperCase().match(/^S?0*(\d+)$/);
    return match ? `S${match[1].padStart(3, "0")}` : null;
}

function normalizeMomentId(value) {
    const match = String(value || "").trim().toUpperCase().match(/^S?0*(\d+)\s*[.\-_#]\s*0*(\d+)$/);
    return match ? `S${match[1].padStart(3, "0")}.${match[2]}` : null;
}

function citedIds(beat) {
    const raw = Array.isArray(beat?.moments) ? beat.moments : [];
    return [...new Set(raw.map((value) => normalizeMomentId(value) || String(value).trim()))];
}

// Footage may come from anywhere in the film (stories use cold opens and flashbacks), but a moment is
// never used twice. Unusable picks are replaced with the nearest unused moment instead of failing the recap.
function validateRecap({ parsed, index, angle }) {
    const momentById = new Map();
    const sceneOrder = new Map(index.scenes.map((scene, order) => [scene.id, order]));

    index.scenes.forEach((scene) => {
        scene.moments.forEach((moment) => momentById.set(moment.id, { ...moment, scene_id: scene.id }));
    });

    const allMoments = [...momentById.values()].filter((moment) => !moment.text_only);
    const listed = Array.isArray(parsed?.beats) ? parsed.beats : [];
    const errors = [];
    const fixes = [];

    if (!listed.length) {
        return { errors: ["There are no beats."], fixes, beats: [] };
    }

    const used = new Set();
    let lastAnchor = 0;
    const beats = [];

    listed.forEach((beat, order) => {
        const label = `Beat ${order + 1}`;
        const text = String(beat?.text || "").replace(/\s+/g, " ").trim();
        let shows = String(beat?.shows || "").replace(/\s+/g, " ").trim();
        const ids = citedIds(beat);

        if (!text) {
            fixes.push(`${label} dropped: no text.`);
            return;
        }

        // Cited order is kept: each moment plays as its own shot, in the order the line mentions them.
        const known = ids.map((id) => momentById.get(id)).filter(Boolean);
        let moments = known
            .filter((moment, position) => (
                !moment.text_only &&
                !used.has(moment.id) &&
                known.findIndex((other) => other.id === moment.id) === position
            ))
            .slice(0, MAX_MOMENTS_PER_BEAT);

        if (!moments.length) {
            const anchor = known.length ? known[0].time_sec : lastAnchor;
            const nearest = allMoments
                .filter((moment) => !used.has(moment.id))
                .sort((a, b) => Math.abs(a.time_sec - anchor) - Math.abs(b.time_sec - anchor))[0];

            if (!nearest) {
                fixes.push(`${label} dropped: every moment is already used.`);
                return;
            }

            moments = [nearest];
            fixes.push(`${label}: ${ids.join(", ") || "no footage picked"}; using nearest unused ${nearest.id}.`);
        } else if (moments.length < ids.length) {
            const skipped = ids.filter((id) => !moments.some((moment) => moment.id === id));
            fixes.push(`${label}: ignored ${skipped.join(", ")} (unknown, credits, reused or over ${MAX_MOMENTS_PER_BEAT}).`);
        }

        if (!shows) {
            shows = moments.map((moment) => moment.shows).filter(Boolean).join("; ");
        }

        moments.forEach((moment) => used.add(moment.id));
        lastAnchor = moments[0].time_sec;

        const sceneIds = [...new Set(moments.map((moment) => moment.scene_id))]
            .sort((a, b) => sceneOrder.get(a) - sceneOrder.get(b));

        beats.push({ text, shows, moments, scenes: sceneIds });
    });

    const unpicked = listed.filter((beat) => !citedIds(beat).length).length;

    if (unpicked > listed.length * MAX_UNPICKED_SHARE) {
        errors.push(`No footage was picked for ${unpicked} of ${listed.length} lines.`);
    }

    if (beats.length < angle.minBeats || beats.length > angle.maxBeats) {
        fixes.push(`${beats.length} lines (asked for ${angle.minBeats}-${angle.maxBeats}); kept as written.`);
    }

    return { errors, fixes, beats };
}

module.exports = {
    validateRecap,
    normalizeSceneId,
    normalizeMomentId
};
