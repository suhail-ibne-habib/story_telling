#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys


def main():
    parser = argparse.ArgumentParser(
        description="Split a scene clip into camera shots with PySceneDetect."
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--threshold", type=float, default=27.0)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    from scenedetect import (
        ContentDetector,
        SceneManager,
        open_video,
        split_video_ffmpeg,
    )

    video = open_video(args.input)
    manager = SceneManager()
    manager.add_detector(ContentDetector(threshold=args.threshold))
    manager.detect_scenes(video)
    scenes = manager.get_scene_list()

    if not scenes:
        scenes = [(video.base_timecode, video.duration)]

    split_video_ffmpeg(
        args.input,
        scenes,
        output_dir=args.output_dir,
        output_file_template="shot_$SCENE_NUMBER.mp4",
        show_progress=False,
        show_output=False,
    )

    def shot_key(name):
        match = re.search(r"(\d+)", name)
        return int(match.group(1)) if match else name

    matches = sorted(
        (
            name
            for name in os.listdir(args.output_dir)
            if name.lower().endswith(".mp4")
        ),
        key=shot_key,
    )

    shots = []

    for index, (start, end) in enumerate(scenes, start=1):
        file_name = matches[index - 1] if index - 1 < len(matches) else f"shot_{index:03d}.mp4"

        shots.append(
            {
                "index": index,
                "file": file_name,
                "start_sec": float(start.get_seconds()),
                "end_sec": float(end.get_seconds()),
            }
        )

    payload = {"shots": shots}
    shots_path = os.path.join(args.output_dir, "shots.json")

    with open(shots_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)

    print(json.dumps(payload))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
