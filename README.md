# Storytelling recap pipeline

Turn a movie file into a fast, attractive recap. Gemini watches a 480p proxy; local tools cut the original.

## Pipeline

```
movie
  → metadata
  → downsample to 480p proxy
  → Gemini events + narration (full proxy, one upload)
  → FFmpeg slice each event from the original
  → PySceneDetect camera shots
  → Gemini selected_shots [1, 4, 9]
  → stitch selected shots (original aspect)
  → Edge TTS + mix
```

No Whisper. No DeepSeek. No 10-minute splits. No 9:16 shorts.

## How it works

1. **Downsample** — local 480p / CRF 28 proxy. Gemini only needs semantic clarity.
2. **Events** — Gemini returns coarse scene windows, a voiceover line, and a visual description. Feature recaps target 6–8 minutes of spoken narration. Short sources target 2–3 minutes.
3. **Shots** — FFmpeg cuts that window from the original file. PySceneDetect splits every camera change.
4. **Select** — numbered thumbnails + the voiceover line go back to Gemini. It returns shot indexes only, never timestamps.
5. **Voice** — Edge TTS speaks the line. Assembled shots are sped or trimmed to match that duration, then mixed and concatenated.

Cuts are frame-accurate because PySceneDetect and FFmpeg do them. Gemini never cuts mid-shot.

## How to run

Put the movie in `backend/storage/inputs/`.

Needs `GEMINI_API_KEY` in `backend/.env`. Optional: `GEMINI_EVENT_MODEL` (default `gemini-3.5-flash`, used once to watch the movie), `GEMINI_MODEL` (default `gemini-3.1-flash-lite`, shot picking), `EDGE_TTS_VOICE`.

PySceneDetect:

```
pip install -r backend/requirements.txt
```

```json
POST /api/v1/jobs
{ "filename": "movie_1080.mp4" }
```

Resume:

```json
POST /api/v1/jobs
{ "jobId": "<job-id>" }
```

## Outputs

```
storage/jobs/<jobId>/
  proxy/movie.mp4
  events/manifest.json
  events/R001/scene.mp4
  events/R001/shots/shot_001.mp4
  events/R001/selected.json
  events/R001/assembled.mp4
  voice/R001.mp3
  output/recap_voiced.mp4
```
