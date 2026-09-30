const fs = require("fs");
const path = require("path");

async function readJson(filePath) {
    return JSON.parse(
        await fs.promises.readFile(filePath, "utf-8")
    );
}

async function writeJson(filePath, data) {
    await fs.promises.mkdir(
        path.dirname(filePath),
        { recursive: true }
    );

    await fs.promises.writeFile(
        filePath,
        JSON.stringify(data, null, 2),
        "utf-8"
    );
}

function parseJsonFromText(raw) {
    const text = String(raw || "").trim();

    if (!text) {
        throw new Error("Empty JSON text.");
    }

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1].trim() : text;

    try {
        return JSON.parse(body);
    } catch (error) {
        const start = body.indexOf("{");
        const end = body.lastIndexOf("}");

        if (start >= 0 && end > start) {
            return JSON.parse(body.slice(start, end + 1));
        }

        throw error;
    }
}

module.exports = {
    readJson,
    writeJson,
    parseJsonFromText
};
