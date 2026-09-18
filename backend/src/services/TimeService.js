const MIN_EVENT_MS = 8000;

function parseClock(value) {
    if (value == null || value === "") {
        return null;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        return value < 100000
            ? Math.round(value * 1000)
            : Math.round(value);
    }

    const text = String(value).trim();

    if (/^\d+(\.\d+)?$/.test(text)) {
        const number = Number(text);

        return number < 100000
            ? Math.round(number * 1000)
            : Math.round(number);
    }

    const normalized = text.replace(",", ".");
    const match = normalized.match(
        /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/
    );

    if (!match) {
        return null;
    }

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const millis = Number((match[4] || "0").padEnd(3, "0"));

    return ((hours * 3600) + (minutes * 60) + seconds) * 1000 + millis;
}

function formatClockHms(ms) {
    const clamped = Math.max(0, Math.round(ms));
    const hours = Math.floor(clamped / 3600000);
    const minutes = Math.floor((clamped % 3600000) / 60000);
    const seconds = Math.floor((clamped % 60000) / 1000);

    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(seconds).padStart(2, "0")
    ].join(":");
}

function formatClock(ms) {
    const clamped = Math.max(0, Math.round(ms));
    const hours = Math.floor(clamped / 3600000);
    const minutes = Math.floor((clamped % 3600000) / 60000);
    const seconds = Math.floor((clamped % 60000) / 1000);
    const millis = clamped % 1000;

    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(seconds).padStart(2, "0")
    ].join(":") + "," + String(millis).padStart(3, "0");
}

function clampRange(startMs, endMs, durationMs, padMs = 0) {
    const maxMs = Math.max(0, Math.round(durationMs || 0));
    let start = Math.round(Number(startMs));
    let end = Math.round(Number(endMs));

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return {
            startMs: 0,
            endMs: 0,
            durationMs: 0
        };
    }

    if (end < start) {
        const swapped = start;
        start = end;
        end = swapped;
    }

    start = Math.max(0, start - padMs);
    end = end + padMs;

    if (maxMs > 0) {
        start = Math.min(start, maxMs);
        end = Math.min(end, maxMs);
    }

    if (end - start < MIN_EVENT_MS) {
        if (maxMs > 0) {
            end = Math.min(maxMs, Math.max(end, start + MIN_EVENT_MS));
            start = Math.max(0, end - MIN_EVENT_MS);

            if (end > maxMs) {
                end = maxMs;
                start = Math.max(0, maxMs - MIN_EVENT_MS);
            }
        } else {
            end = start + MIN_EVENT_MS;
        }
    }

    return {
        startMs: start,
        endMs: end,
        durationMs: Math.max(0, end - start)
    };
}

module.exports = {
    parseClock,
    formatClock,
    formatClockHms,
    clampRange,
    MIN_EVENT_MS
};
