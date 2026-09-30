"""Transcribe a movie into timed dialogue segments.

Usage: python transcribe.py <video> <out_json> [--model small] [--language en]
Output: {"language", "engine", "model", "segments": [{"start", "end", "text"}]}
"""
import argparse
import json
import os
import sys
import time


def log(message):
    print(message, file=sys.stderr, flush=True)


def run_faster_whisper(video, model_name, language):
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        video,
        language=language,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,
    )

    duration = float(getattr(info, "duration", 0) or 0)
    out = []
    last_report = 0.0

    for segment in segments:
        text = segment.text.strip()
        if text:
            out.append({
                "start": round(float(segment.start), 2),
                "end": round(float(segment.end), 2),
                "text": text,
            })

        if duration and segment.end - last_report >= 300:
            last_report = segment.end
            log(f"[transcribe] {segment.end / duration * 100:5.1f}% ({len(out)} segments)")

    return info.language, out


def run_openai_whisper(video, model_name, language):
    import whisper

    model = whisper.load_model(model_name, device="cpu")
    result = model.transcribe(video, language=language, fp16=False, verbose=False)
    out = [
        {
            "start": round(float(s["start"]), 2),
            "end": round(float(s["end"]), 2),
            "text": s["text"].strip(),
        }
        for s in result.get("segments", [])
        if s["text"].strip()
    ]
    return result.get("language"), out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("out_json")
    parser.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "small"))
    parser.add_argument("--language", default=os.environ.get("WHISPER_LANGUAGE") or None)
    args = parser.parse_args()

    started = time.time()

    try:
        engine = "faster-whisper"
        language, segments = run_faster_whisper(args.video, args.model, args.language)
    except ImportError:
        engine = "openai-whisper"
        log("[transcribe] faster-whisper unavailable, falling back to openai-whisper")
        language, segments = run_openai_whisper(args.video, args.model, args.language)

    os.makedirs(os.path.dirname(os.path.abspath(args.out_json)), exist_ok=True)
    tmp = args.out_json + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(
            {"language": language, "engine": engine, "model": args.model, "segments": segments},
            handle,
            ensure_ascii=False,
            indent=1,
        )
    os.replace(tmp, args.out_json)

    log(f"[transcribe] {len(segments)} segments in {time.time() - started:.0f}s")
    print(json.dumps({"segments": len(segments), "engine": engine}))


if __name__ == "__main__":
    main()
