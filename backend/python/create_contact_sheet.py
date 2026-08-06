from PIL import Image
import sys
import math
import os

THUMB_WIDTH = 320
THUMB_HEIGHT = 180

PADDING = 10
BACKGROUND = (25, 25, 25)

def load_images(paths):
    images = []

    for path in paths:
        try:
            image = Image.open(path).convert("RGB")
            image.thumbnail(
                (THUMB_WIDTH, THUMB_HEIGHT),
                Image.Resampling.LANCZOS
            )
            images.append(image)
        except Exception as e:
            print(f"Failed to load {path}: {e}")
    
    return images

def calculate_grid(count):
    columns = 4
    rows = math.ceil(count / columns)

    return rows, columns

def create_canvas(rows, columns):
    width = (
        columns * THUMB_WIDTH + (columns + 1) * PADDING
    )

    height = (
        rows * THUMB_HEIGHT + (rows + 1) * PADDING
    )

    return Image.new(
        'RGB',
        (width, height),
        BACKGROUND
    )

def paste_images( canvas, images, rows, columns):
    for index, image in enumerate(images):

        row = index // columns
        column = index % columns

        x = (
            PADDING + column * ( THUMB_WIDTH + PADDING )
        )

        y = (
            PADDING + row * ( THUMB_HEIGHT + PADDING )
        )

        canvas.paste( image, (x,y) )

def main():
    if len(sys.argv) < 3:
        print(
            "Usage: python create_contact_sheet.py output.jpg img1 img2 ..."
        )
        sys.exit(1)

    output_path = sys.argv[1]
    image_paths = sys.argv[2:]

    images = load_images(image_paths)

    if not images:
        print("No valid images.")
        sys.exit(1)

    rows, columns = calculate_grid(
        len(images)
    )

    canvas = create_canvas(
        rows, columns
    )

    paste_images(
        canvas,
        images,
        rows,
        columns
    )

    os.makedirs(
        os.path.dirname(output_path),
        exist_ok=True
    )

    canvas.save(
        output_path,
        quality=95
    )

    print(output_path)

if __name__ == "__main__":
    main()
