import sys
import math
import os
import json

from PIL import Image, ImageDraw, ImageFont


THUMB_WIDTH = 320
THUMB_HEIGHT = 180

PADDING = 10

BACKGROUND = (25, 25, 25)

TIMESTAMP_FONT_SIZE = 18


def format_timestamp(seconds):
    """
    Convert seconds into:

        MM:SS.mmm

    or:

        HH:MM:SS.mmm

    Example:

        2723.421
        -> 45:23.421

        4589.320
        -> 01:16:29.320
    """

    seconds = float(seconds)

    total_milliseconds = round(
        seconds * 1000
    )

    hours = (
        total_milliseconds
        // 3_600_000
    )

    remaining = (
        total_milliseconds
        % 3_600_000
    )

    minutes = (
        remaining
        // 60_000
    )

    remaining %= 60_000

    secs = (
        remaining
        // 1_000
    )

    milliseconds = (
        remaining
        % 1_000
    )


    if hours > 0:

        return (
            f"{hours:02d}:"
            f"{minutes:02d}:"
            f"{secs:02d}."
            f"{milliseconds:03d}"
        )


    return (
        f"{minutes:02d}:"
        f"{secs:02d}."
        f"{milliseconds:03d}"
    )


def load_font(size=TIMESTAMP_FONT_SIZE):

    font_paths = [

        "arial.ttf",

        "/usr/share/fonts/"
        "truetype/dejavu/"
        "DejaVuSans-Bold.ttf",

        "/System/Library/Fonts/"
        "Helvetica.ttc",

        "/usr/share/fonts/"
        "truetype/liberation/"
        "LiberationSans-Bold.ttf",

    ]


    for font_path in font_paths:

        try:

            return ImageFont.truetype(
                font_path,
                size
            )

        except Exception:

            continue


    return ImageFont.load_default()


def draw_timestamp(
    image,
    timestamp_text
):

    font = load_font()


    draw = ImageDraw.Draw(
        image
    )


    bbox = draw.textbbox(
        (0, 0),
        timestamp_text,
        font=font
    )


    text_width = (
        bbox[2] - bbox[0]
    )

    text_height = (
        bbox[3] - bbox[1]
    )


    padding = 6


    bg_x1 = 4

    bg_y1 = (
        image.height
        - text_height
        - padding * 2
        - 4
    )

    bg_x2 = (
        bg_x1
        + text_width
        + padding * 2
    )

    bg_y2 = (
        image.height - 4
    )


    # Semi-transparent black
    # timestamp background.

    overlay = Image.new(
        "RGBA",
        image.size,
        (0, 0, 0, 0)
    )

    overlay_draw = ImageDraw.Draw(
        overlay
    )

    overlay_draw.rounded_rectangle(
        [
            bg_x1,
            bg_y1,
            bg_x2,
            bg_y2
        ],
        radius=4,
        fill=(
            0,
            0,
            0,
            210
        )
    )

    image_rgba = image.convert("RGBA")

    image_rgba = Image.alpha_composite(
        image_rgba,
        overlay
    )

    image = image_rgba.convert("RGB")

    draw = ImageDraw.Draw(image)


    draw.text(

        (
            bg_x1 + padding,
            bg_y1 + padding // 2
        ),

        timestamp_text,

        fill=(
            255,
            255,
            255
        ),

        font=font

    )


    return image


def load_and_stamp_images(frames):

    images = []


    for frame in frames:

        image_path = frame.get(
            "path"
        )

        timestamp = frame.get(
            "timestamp"
        )


        if not image_path:

            print(
                "Skipping frame without path",
                file=sys.stderr
            )

            continue


        if timestamp is None:

            print(
                f"Skipping frame without timestamp: {image_path}",
                file=sys.stderr
            )

            continue


        try:

            timestamp = float(
                timestamp
            )


            img = Image.open(
                image_path
            ).convert("RGB")


            # Resize while maintaining
            # aspect ratio.

            img.thumbnail(
                (
                    THUMB_WIDTH,
                    THUMB_HEIGHT
                ),
                Image.Resampling.LANCZOS
            )

            # Create fixed-size thumbnail.

            thumb = Image.new(
                "RGB",
                (
                    THUMB_WIDTH,
                    THUMB_HEIGHT
                ),
                (
                    0,
                    0,
                    0
                )
            )

            x_offset = (
                THUMB_WIDTH
                - img.width
            ) // 2

            y_offset = (
                THUMB_HEIGHT
                - img.height
            ) // 2

            thumb.paste(
                img,
                (
                    x_offset,
                    y_offset
                )
            )

            # Burn exact timestamp.

            timestamp_text = format_timestamp(
                timestamp
            )

            thumb = draw_timestamp(
                thumb,
                timestamp_text
            )


            images.append(
                thumb
            )


        except Exception as error:

            print(

                f"Failed to load "
                f"{image_path}: {error}",

                file=sys.stderr

            )


    return images


def calculate_grid(count):

    columns = 4

    rows = math.ceil(
        count / columns
    )

    return rows, columns


def create_canvas(
    rows,
    columns
):

    width = (
        columns * THUMB_WIDTH
        + (columns + 1) * PADDING
    )


    height = (
        rows * THUMB_HEIGHT
        + (rows + 1) * PADDING
    )


    return Image.new(

        "RGB",

        (
            width,
            height
        ),

        BACKGROUND

    )


def paste_images(
    canvas,
    images,
    rows,
    columns
):

    for index, image in enumerate(
        images
    ):

        row = (
            index // columns
        )

        column = (
            index % columns
        )


        x = (
            PADDING
            + column
            * (
                THUMB_WIDTH
                + PADDING
            )
        )


        y = (
            PADDING
            + row
            * (
                THUMB_HEIGHT
                + PADDING
            )
        )


        canvas.paste(
            image,
            (x, y)
        )


def main():

    if len(sys.argv) < 3:

        print(
            "Usage: "
            "python create_contact_sheet.py "
            "<output.jpg> "
            "<metadata.json>"
        )

        sys.exit(1)


    output_path = sys.argv[1]

    metadata_path = sys.argv[2]


    try:

        with open(
            metadata_path,
            "r",
            encoding="utf-8"
        ) as file:

            frames = json.load(file)

    except Exception as error:

        print(
            f"Failed to read metadata: {error}",
            file=sys.stderr
        )

        sys.exit(1)


    if not frames:

        print(
            "No frames in metadata.",
            file=sys.stderr
        )

        sys.exit(1)


    images = load_and_stamp_images(
        frames
    )


    if not images:

        print(
            "No valid images.",
            file=sys.stderr
        )

        sys.exit(1)


    rows, columns = calculate_grid(
        len(images)
    )

    canvas = create_canvas(
        rows,
        columns
    )


    paste_images(

        canvas,

        images,

        rows,

        columns

    )


    output_directory = os.path.dirname(
        output_path
    )


    if output_directory:

        os.makedirs(
            output_directory,
            exist_ok=True
        )


    canvas.save(

        output_path,

        "JPEG",

        quality=95,

        optimize=True

    )


    print(
        output_path
    )


if __name__ == "__main__":
    main()