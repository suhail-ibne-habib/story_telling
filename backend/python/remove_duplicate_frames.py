import sys
import json

from PIL import Image
import imagehash

def calculate_hash(image_path):
    image = Image.open(image_path)
    return imagehash.phash(image)

def remove_duplicates(paths, threshold):
    unique = []
    hashes = []

    print(f"Original frames : {len(paths)}", file=sys.stderr)

    for path in paths:
        current_hash = calculate_hash(path)

        duplicate = False

        for existing_hash in hashes:
            distance = current_hash - existing_hash

            print(
                f"Comparing {path} | Distance = {distance}",
                file=sys.stderr
            )

            if distance <= threshold:
                duplicate = True
                break
        
        if not duplicate:
            unique.append(path)
            hashes.append(current_hash)

    print(
        f"Unique frames : {len(unique)}",
        file=sys.stderr
    )

    return unique

def main():
    threshold = int(sys.argv[1])

    image_paths = sys.argv[2:]

    unique = remove_duplicates(
        image_paths,
        threshold
    )

    print(
        json.dumps(unique)
    )

if __name__ == "__main__":
    main()