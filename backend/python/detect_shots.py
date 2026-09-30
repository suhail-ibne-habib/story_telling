"""Detect shot boundaries with PySceneDetect.

Usage: python detect_shots.py <video> <out_json> [--threshold 27]
Output: {"input", "shots": [{"index", "start_sec", "end_sec", "duration_sec"}]}
"""
import argparse
import json
import os
import sys
import time

from scenedetect import ContentDetector, SceneManager, open_video


def log(message):
    print(message, file=sys.stderr, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("out_json")
    parser.add_argument("--threshold", type=float, default=27.0)
    parser.add_argument("--min-shot-sec", type=float, default=0.6)
    args = parser.parse_args()

    started = time.time()
    video = open_video(args.video)
    fps = float(video.frame_rate)
    total_sec = float(video.duration.get_seconds()) if video.duration else 0.0

    manager = SceneManager()
    manager.auto_downscale = True
    manager.add_detector(
        ContentDetector(
            threshold=args.threshold,
            min_scene_len=max(1, int(round(args.min_shot_sec * fps))),
        )
    )

    state = {"last": 0.0}

    def on_frame(_frame, timecode):
        seconds = timecode.get_seconds()
        if total_sec and seconds - state["last"] >= 300:
            state["last"] = seconds
            log(f"[shots] {seconds / total_sec * 100:5.1f}%")

    manager.detect_scenes(video=video, callback=on_frame)
    scene_list = manager.get_scene_list(start_in_scene=True)

    shots = []
    for index, (start, end) in enumerate(scene_list, start=1):
        start_sec = float(start.get_seconds())
        end_sec = float(end.get_seconds())
        shots.append({
            "index": index,
            "start_sec": round(start_sec, 3),
            "end_sec": round(end_sec, 3),
            "duration_sec": round(end_sec - start_sec, 3),
        })

    os.makedirs(os.path.dirname(os.path.abspath(args.out_json)), exist_ok=True)
    tmp = args.out_json + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump({"input": args.video, "fps": fps, "shots": shots}, handle, indent=1)
    os.replace(tmp, args.out_json)

    log(f"[shots] {len(shots)} shots in {time.time() - started:.0f}s")
    print(json.dumps({"shots": len(shots)}))


if __name__ == "__main__":
    main()
