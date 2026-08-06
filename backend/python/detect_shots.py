import sys
import json

from scenedetect import detect
from scenedetect.detectors import AdaptiveDetector


def detect_shots(video_path):
    detector = AdaptiveDetector(
        adaptive_threshold=3.0,
        min_scene_len=10
    )

    scene_list = detect(
        video_path,
        detector,
        show_progress=False
    )

    shots = []

    for index, scene in enumerate(scene_list):
        start_time, end_time = scene

        start = round(start_time.get_seconds(), 3)
        end = round(end_time.get_seconds(), 3)

        shots.append({
            "id": index + 1,
            "start": start,
            "end": end,
            "duration": round(end - start, 3)
        })

    return shots


def main():
    if len(sys.argv) < 2:
        raise ValueError("Video path is required")

    video_path = sys.argv[1]

    shots = detect_shots(video_path)

    print(json.dumps(shots))


if __name__ == "__main__":
    main()