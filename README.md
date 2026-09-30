# Storytelling recap pipeline

The AI writes the story, but it never writes a timestamp. It picks **moment IDs** (e.g. `S045.2`) from an index built from the movie file, and every timestamp comes from PySceneDetect and Whisper.

```
Movie index (once per movie, cached in backend/storage/index/<movie>/)
  1. Whisper            → dialogue with exact times                 subtitles.json
  2. PySceneDetect      → shot cuts with exact times                shots.json
  3. Group shots        → ~15–50s scenes                            scenes.json
  4. Contact sheet      → one tile per shot (every 3s in long shots),
                          labelled "#n HH:MM:SS", near-duplicate
                          frames dropped, max 16 (4×4)              grids_v3/, grids_v3/tiles.json
  5. Gemini vision      → scene summary + what each tile shows,
                          credits/text frames flagged               scene_notes_v3.json
  6. Save                                                           movie_index.json, index_lines.txt

Recap (one DeepSeek call per angle; the scene list is a shared, cached prefix)
  7. DeepSeek writes beats: text + 1–3 moment IDs + "shows" (what the viewer sees)
  8. Checks: IDs exist, no credits frames, no moment reused; a line with no usable pick gets the nearest unused moment

Cut
  9. Edge TTS per beat → exact duration
 10. Clip placed on the cited moment's shot. A line citing moments from different shots plays one
     shot per moment (≥ 2s each, max 3), in the cited order, each matched to its part of "shows"
 11. Gemini checks 3 frames of each shot: is the expected subject AND action visible? (pass ≥ 7)
     Nothing passes → DeepSeek rewrites the line to match the best footage, re-voiced and re-checked
 12. FFmpeg: voice on each clip, then join → output/<angle>.mp4
```

Stages: metadata → index → recap → tts → cut → assemble.

## How to run

Put the movie in `backend/storage/inputs/`.

Needs in `backend/.env`:

- `GEMINI_API_KEY` (scene captions and clip checks)
- `DEEPSEEK_API_KEY` (recap)
- Optional: `GEMINI_MODEL`, `DEEPSEEK_MODEL`, `EDGE_TTS_VOICE`, `WHISPER_MODEL` (default `small`), `CAPTION_CONCURRENCY` (default 4), `VERIFY_CLIPS=false`, `VERIFY_PASS_SCORE` (default 7), `VERIFY_MAX_CHECKS` (default 4), `REWRITE_UNMATCHED=true` (rewrite a line when no clip fits; off by default so the story text is never changed)

```json
POST /api/v1/jobs
{
  "filename": "let me in.mp4",
  "title": "Let Me In 2010",
  "angles": ["narrator", "shorts"]
}
```

Angles: `narrator` (default: 40–75 third-person, moment-by-moment beats), `storyteller` (6 first-person beats), `recap`, `villain`, `twist`, `shorts`. Each angle becomes its own video.

Resume:

```json
POST /api/v1/jobs
{ "jobId": "<job-id>" }
```

Build only the index (optional, the pipeline does it too):

    cd backend
    npm run index -- "let me in.mp4"

## Review

```
backend/storage/jobs/<jobId>/review/index.html
```

or `/inspect.html` on the API. Beats whose clip failed the vision check are marked "needs review".
# story_telling
# story_telling
