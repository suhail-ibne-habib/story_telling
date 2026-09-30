"""Build one labelled contact sheet per scene.

Usage: python scene_sheets.py <video> <jobs_json> <out_dir> [--tile-width 320] [--max-tiles 16]
jobs_json: [{"id", "sheet", "samples": [{"time_sec", "shot"}]}]  (samples in time order)

Each kept sample becomes a tile labelled "#<n> HH:MM:SS". Near-identical frames
(same shot angle, black frames) are dropped before the sheet is laid out.
Writes <out_dir>/<sheet> and records the tiles in <out_dir>/tiles.json:
{"<sheet>": [{"tile": 1, "time_sec": 12.5, "shot": 4}]}
Sheets already listed in tiles.json are kept, so the script can resume.
"""
import argparse
import json
import os
import sys
import time

import cv2
import numpy as np

COLUMNS = 4
DUPLICATE_BITS = 8
DARK_MEAN = 12


def log(message):
    print(message, file=sys.stderr, flush=True)


def clock(seconds):
    total = int(max(0.0, seconds))
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def read_frame(capture, seconds):
    capture.set(cv2.CAP_PROP_POS_MSEC, max(0.0, seconds) * 1000.0)
    ok, frame = capture.read()
    return frame if ok else None


def resize(frame, width):
    height = int(round(frame.shape[0] * width / frame.shape[1]))
    return cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)


def dhash(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    small = cv2.resize(gray, (9, 8), interpolation=cv2.INTER_AREA)
    return (small[:, 1:] > small[:, :-1]).flatten()


def is_duplicate(signature, kept):
    return any(int(np.count_nonzero(signature != other)) <= DUPLICATE_BITS for other in kept)


def pick_evenly(items, limit):
    if len(items) <= limit:
        return items
    step = (len(items) - 1) / (limit - 1)
    return [items[round(order * step)] for order in range(limit)]


def label(tile, text):
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.55
    (width, height), baseline = cv2.getTextSize(text, font, scale, 1)
    cv2.rectangle(tile, (0, 0), (width + 10, height + baseline + 8), (0, 0, 0), -1)
    cv2.putText(tile, text, (5, height + 4), font, scale, (255, 255, 255), 1, cv2.LINE_AA)


def select_frames(capture, samples, width, max_tiles):
    decoded = []
    for sample in samples:
        frame = read_frame(capture, float(sample["time_sec"]))
        if frame is not None:
            decoded.append((sample, resize(frame, width)))

    if not decoded:
        return []

    bright = [item for item in decoded if item[1].mean() >= DARK_MEAN]
    pool = bright or decoded[:1]

    kept, signatures = [], []
    for sample, frame in pool:
        signature = dhash(frame)
        if is_duplicate(signature, signatures):
            continue
        signatures.append(signature)
        kept.append((sample, frame))

    return pick_evenly(kept, max_tiles)


def layout(frames):
    height = min(frame.shape[0] for _, frame in frames)
    width = frames[0][1].shape[1]
    columns = min(COLUMNS, len(frames))
    rows = (len(frames) + columns - 1) // columns
    sheet = np.zeros((rows * height, columns * width, 3), dtype=np.uint8)

    for order, (_, frame) in enumerate(frames):
        row, column = divmod(order, columns)
        sheet[row * height:(row + 1) * height, column * width:(column + 1) * width] = frame[:height]

    return sheet


def save_tiles(path, tiles):
    temp = f"{path}.tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(tiles, handle, indent=2)
    os.replace(temp, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("jobs_json")
    parser.add_argument("out_dir")
    parser.add_argument("--tile-width", type=int, default=320)
    parser.add_argument("--max-tiles", type=int, default=16)
    args = parser.parse_args()

    with open(args.jobs_json, "r", encoding="utf-8") as handle:
        jobs = json.load(handle)

    os.makedirs(args.out_dir, exist_ok=True)
    tiles_path = os.path.join(args.out_dir, "tiles.json")
    tiles = {}
    if os.path.exists(tiles_path):
        with open(tiles_path, "r", encoding="utf-8") as handle:
            tiles = json.load(handle)

    capture = cv2.VideoCapture(args.video)
    if not capture.isOpened():
        raise SystemExit(f"Cannot open video: {args.video}")

    started = time.time()
    written = 0

    for number, job in enumerate(jobs, start=1):
        target = os.path.join(args.out_dir, job["sheet"])
        if job["sheet"] in tiles and os.path.exists(target):
            continue

        frames = select_frames(capture, job["samples"], args.tile_width, args.max_tiles)
        if not frames:
            log(f"[sheets] {job['id']}: no frames decoded")
            continue

        entries = []
        for order, (sample, frame) in enumerate(frames, start=1):
            label(frame, f"#{order} {clock(float(sample['time_sec']))}")
            entries.append({
                "tile": order,
                "time_sec": round(float(sample["time_sec"]), 3),
                "shot": sample.get("shot")
            })

        cv2.imwrite(target, layout(frames), [cv2.IMWRITE_JPEG_QUALITY, 85])
        tiles[job["sheet"]] = entries
        written += 1

        if number % 25 == 0:
            save_tiles(tiles_path, tiles)
            log(f"[sheets] {number}/{len(jobs)}")

    capture.release()
    save_tiles(tiles_path, tiles)
    log(f"[sheets] wrote {written} sheets in {time.time() - started:.0f}s")
    print(json.dumps({"written": written, "total": len(jobs)}))


if __name__ == "__main__":
    main()
