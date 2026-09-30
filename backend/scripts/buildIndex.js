// Usage (from backend/): npm run index -- "let me in.mp4"
require("dotenv").config();

const MovieIndexService = require("../src/services/MovieIndexService");

async function main() {
    const filename = process.argv.slice(2).join(" ").trim();

    if (!filename) {
        console.error('Usage: npm run index -- "<file in storage/inputs>"');
        process.exit(1);
    }

    const started = Date.now();
    const index = await MovieIndexService.build(filename);

    console.log(
        `\nDone: ${index.scenes.length} scenes in ${((Date.now() - started) / 60000).toFixed(1)} min`
    );
    console.log(MovieIndexService.getPaths(filename).lines);
}

main().catch((error) => {
    console.error(`\nIndex failed: ${error.message}`);
    process.exit(1);
});
