#!/usr/bin/env python3
"""Compose Chrome Web Store frames from the committed panel crops.

Direction B (default, ``pnpm store-screenshots:final``) writes the approved
1280×800 finals to ``docs/store-screenshots/0.2.5/final/``, plus ``board.png``.

Direction A (``pnpm store-screenshots:final:a``) writes its output frames
to ``docs/store-screenshots/0.2.5-dirA/``. It reads the 2× panel crops in
``docs/store-screenshots/0.2.5-dirA/panel/``. Full panels are 840×1322.
``05b-local-privacy.png`` is stored already cropped to 840×1200 so
« Diagnostics IA » is not in the file. Loupe ``source`` rects are 1×
coordinates and are multiplied by the detected input scale. A 2× panel uses
panel scale 0.475 (0.95/2) and loupe scale 0.65 (1.3/2), which keeps the
same rendered sizes as 1×.

Font: vendored, not downloaded at runtime.
``fonts/Inter-VariableFont_opsz,wght.ttf`` is the Google Fonts Inter variable
(opsz, wght), file ``ofl/inter/Inter[opsz,wght].ttf`` from
https://github.com/google/fonts (the name used by the Google Fonts family
download; same axes as the rsms Inter variable).
SHA-256 29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031.
License: SIL Open Font License 1.1, see ``fonts/OFL.txt``.

Requires Pillow. The committed PNGs were rendered with Pillow 12.3.0.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError as exc:  # pragma: no cover - environment guard
    raise SystemExit("Pillow is required (pip install pillow).") from exc

ROOT = Path(__file__).resolve().parents[2]
PANEL_DIR = ROOT / "docs" / "store-screenshots" / "0.2.5" / "panel"
FINAL_DIR = ROOT / "docs" / "store-screenshots" / "0.2.5" / "final"
FONT_PATH = Path(__file__).resolve().parent / "fonts" / "Inter-VariableFont_opsz,wght.ttf"

WIDTH = 1280
HEIGHT = 800
BG = (245, 247, 250)
INK = (14, 26, 43)
MUTED = (95, 107, 120)
SCALE = 640 / 661
PANEL_MARGIN_RIGHT = 150
CAPTION_X = 96
CAPTION_LINE = 52
SUBTITLE_GAP = 16
SUBTITLE_LINE = 32
NOTE = "Données d'exemple"
NOTE_POS = (32, 776)
SHADOW_OFFSET_Y = 8
SHADOW_RADIUS = 12
SHADOW_BLUR = 18
SHADOW_OPACITY = 0.22

# Prefixes reported by the design lead for the input crops she composed from.
EXPECTED_INPUT_PREFIXES = {
    "01b-feed-scrolled.png": "b78b6ff2",
    "02-mission-detail.png": "d1ab6fe4",
    "03-filters-settings.png": "8fa4192f",
    "04-alerts.png": "dd364111",
    "05b-local-privacy.png": "e0fa1abd",
}

SLIDES: tuple[dict[str, object], ...] = (
    {
        "file": "01b-feed-scrolled.png",
        "caption": "4 plateformes. 1 seul feed.",
    },
    {
        "file": "02-mission-detail.png",
        "caption": "Le score explique. Tu décides.",
    },
    {
        "file": "03-filters-settings.png",
        "caption": "Ton profil, ton classement.",
    },
    {
        "file": "04-alerts.png",
        "caption": "Tes alertes, tes critères.",
    },
    {
        "file": "05b-local-privacy.png",
        "caption": "Par défaut, tout reste en local.",
        "subtitle": "Export JSON, CSV ou Markdown. Sauvegarde locale.",
        "crop_bottom": 600,
    },
)

BOARD_TITLE = "MissionPulse 0.2.5 — captures Chrome Web Store (finales, direction B)"
TILE_W = 512
TILE_H = 320
TILE_GAP = 24
TILE_COLUMNS = 3
BOARD_MARGIN = 48

# Native side-panel crop. Loupe source rects below are 1× coordinates.
# logical_crop multiplies them by the detected input scale.
LOGICAL_PANEL = (420, 661)
DIRECTION_A_DIR = ROOT / "docs" / "store-screenshots" / "0.2.5-dirA"
DIRECTION_A_PANEL_DIR = DIRECTION_A_DIR / "panel"

# Design spec, direction A. Shared numbers are the spec; each screen only
# overrides the loupe rect, the caption parts, and (where the spec says so)
# the forced loupe y, the bottom crop, and the subtitle.
DIRECTION_A_CANVAS = {
    "width": 1280,
    "height": 800,
    "background": (0xF5, 0xF7, 0xFA),
    "tint": (0xE6, 0xEC, 0xF4),
    "tint_width": 470,
}
DIRECTION_A_SHADOW = {
    "blur": 18,
    "offset": (0, 8),
    "opacity": 0.22,
    "color": (0x0E, 0x1A, 0x2B),
}
DIRECTION_A_PANEL = {
    "x": 90,
    "scale": 0.95,
    "radius": 12,
    **DIRECTION_A_SHADOW,
}
DIRECTION_A_LOUPE = {
    "x": 240,
    "scale": 1.3,
    "radius": 14,
    "y_nudge": 40,
    "clamp_bottom": 56,
    **DIRECTION_A_SHADOW,
}
DIRECTION_A_CAPTION = {
    "x": 800,
    "y": 338,
    "y_with_subtitle": 308,
    "max_width": 430,
    "size": 50,
    "line_height": 61,
    "baseline_offset": 50,
    "anchor": "ls",
    "weight": 400,
    "bold_weight": 700,
    "color": (0x15, 0x22, 0x42),
}
DIRECTION_A_NOTE = {
    "text": "Données d'exemple",
    "x": 32,
    "y": 776,
    "anchor": "ls",
    "size": 13,
    "weight": 400,
    "color": (0x5F, 0x6B, 0x78),
}
DIRECTION_A_SUBTITLE = {
    "size": 22,
    "weight": 400,
    "color": (0x5F, 0x6B, 0x78),
    "gap": 14,
    "line_height": 30,
}


def direction_a_screen(
    source: tuple[int, int, int, int],
    box: tuple[int, int, int, int],
    parts: tuple[tuple[str, int], ...],
    *,
    loupe_y: int | None = None,
    crop_bottom: int | None = None,
    subtitle: tuple[str, ...] | None = None,
    panel_box: tuple[int, int, int, int],
) -> dict[str, object]:
    x0, y0, x1, y1 = source
    loupe = {
        **DIRECTION_A_LOUPE,
        "source": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
        "box": {"x": box[0], "y": box[1], "w": box[2], "h": box[3]},
    }
    if loupe_y is not None:
        loupe["y"] = loupe_y
    screen: dict[str, object] = {
        "canvas": dict(DIRECTION_A_CANVAS),
        "panel": {
            **DIRECTION_A_PANEL,
            "box": {"x": panel_box[0], "y": panel_box[1], "w": panel_box[2], "h": panel_box[3]},
        },
        "loupe": loupe,
        "caption": {
            **DIRECTION_A_CAPTION,
            "parts": [{"text": text, "weight": weight} for text, weight in parts],
        },
        "note": dict(DIRECTION_A_NOTE),
    }
    if crop_bottom is not None:
        screen["crop_bottom"] = crop_bottom
    if subtitle is not None:
        screen["subtitle"] = {**DIRECTION_A_SUBTITLE, "lines": list(subtitle)}
    return screen


# Loupe rects are (x0, y0, x1, y1) at 1×. box is the rendered loupe (x, y, w, h).
_PANEL_BOX = (90, 86, 399, 628)
_PANEL_BOX_05B = (90, 115, 399, 570)
DIRECTION_A: dict[str, dict[str, object]] = {
    "01b-feed-scrolled.png": direction_a_screen(
        (16, 64, 390, 338),
        (240, 187, 486, 356),
        (("4 plateformes. ", 400), ("1 seul feed", 700), (".", 400)),
        panel_box=_PANEL_BOX,
    ),
    "02-mission-detail.png": direction_a_screen(
        (16, 130, 390, 416),
        (240, 250, 486, 372),
        (("Le score explique. ", 400), ("Tu décides", 700), (".", 400)),
        panel_box=_PANEL_BOX,
    ),
    "03-filters-settings.png": direction_a_screen(
        (16, 80, 388, 302),
        (240, 202, 484, 289),
        (("Ton profil, ", 400), ("ton classement", 700), (".", 400)),
        panel_box=_PANEL_BOX,
    ),
    "04-alerts.png": direction_a_screen(
        (54, 448, 352, 602),
        (240, 400, 387, 200),
        (("Tes alertes, ", 400), ("tes critères", 700), (".", 400)),
        loupe_y=400,
        panel_box=_PANEL_BOX,
    ),
    "05b-local-privacy.png": direction_a_screen(
        (34, 216, 372, 590),
        (240, 258, 439, 486),
        (("Par défaut, ", 400), ("tout reste en local", 700), (".", 400)),
        crop_bottom=600,
        subtitle=("Export JSON, CSV ou Markdown.", "Sauvegarde locale."),
        panel_box=_PANEL_BOX_05B,
    ),
}

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def inter(size: int, weight: int) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(FONT_PATH), size)
    axes = font.get_variation_axes()
    opsz_axis = axes[0]
    opsz = min(opsz_axis["maximum"], max(opsz_axis["minimum"], size))
    font.set_variation_by_axes([opsz, weight])
    return font


def wrap_words(text: str, font: ImageFont.FreeTypeFont, max_width: float) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        trial = word if not current else f"{current} {word}"
        if font.getlength(trial) <= max_width:
            current = trial
            continue
        if current:
            lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size[0] - 1, size[1] - 1),
        radius=radius,
        fill=255,
    )
    return mask


def prepare_panel(path: Path, crop_bottom: int | None) -> Image.Image:
    panel = Image.open(path).convert("RGBA")
    if crop_bottom is not None:
        panel = panel.crop((0, 0, panel.width, crop_bottom))
    scaled = (
        round(panel.width * SCALE),
        round(panel.height * SCALE),
    )
    return panel.resize(scaled, Image.Resampling.LANCZOS)


def compose_slide(
    panel: Image.Image,
    caption: str,
    subtitle: str | None,
    caption_font: ImageFont.FreeTypeFont,
    subtitle_font: ImageFont.FreeTypeFont,
    note_font: ImageFont.FreeTypeFont,
) -> Image.Image:
    panel_w, panel_h = panel.size
    x = WIDTH - panel_w - PANEL_MARGIN_RIGHT
    y = (HEIGHT - panel_h) // 2
    mask = rounded_mask((panel_w, panel_h), SHADOW_RADIUS)

    shadow_mask = Image.new("L", (WIDTH, HEIGHT), 0)
    shadow_mask.paste(mask, (x, y + SHADOW_OFFSET_Y))
    blurred = shadow_mask.filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    shadow_alpha = blurred.point(lambda value: int(value * SHADOW_OPACITY + 0.5))
    shadow = Image.new("RGBA", (WIDTH, HEIGHT), (*INK, 0))
    shadow.putalpha(shadow_alpha)

    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (*BG, 255))
    canvas.alpha_composite(shadow)
    clipped = panel.copy()
    clipped.putalpha(mask)
    canvas.paste(clipped, (x, y), clipped)

    flat = Image.new("RGB", (WIDTH, HEIGHT), BG)
    flat.paste(canvas, (0, 0), canvas)

    max_width = x - 160
    caption_lines = wrap_words(caption, caption_font, max_width)
    subtitle_lines = wrap_words(subtitle, subtitle_font, max_width) if subtitle else []
    total = len(caption_lines) * CAPTION_LINE
    if subtitle_lines:
        total += SUBTITLE_GAP + len(subtitle_lines) * SUBTITLE_LINE
    text_y = 400 - total // 2

    draw = ImageDraw.Draw(flat)
    for index, line in enumerate(caption_lines):
        draw.text((CAPTION_X, text_y + index * CAPTION_LINE), line, font=caption_font, fill=INK, anchor="lt")
    if subtitle_lines:
        subtitle_y = text_y + len(caption_lines) * CAPTION_LINE + SUBTITLE_GAP
        for index, line in enumerate(subtitle_lines):
            draw.text(
                (CAPTION_X, subtitle_y + index * SUBTITLE_LINE),
                line,
                font=subtitle_font,
                fill=MUTED,
                anchor="lt",
            )
    draw.text(NOTE_POS, NOTE, font=note_font, fill=MUTED, anchor="ls")
    return flat


def compose_board(slides: list[Image.Image], title_font: ImageFont.FreeTypeFont) -> Image.Image:
    rows = (len(slides) + TILE_COLUMNS - 1) // TILE_COLUMNS
    grid_w = TILE_COLUMNS * TILE_W + (TILE_COLUMNS - 1) * TILE_GAP
    grid_h = rows * TILE_H + (rows - 1) * TILE_GAP
    title_bbox = title_font.getbbox(BOARD_TITLE)
    title_h = title_bbox[3] - title_bbox[1]
    board_w = grid_w + BOARD_MARGIN * 2
    board_h = BOARD_MARGIN + title_h + TILE_GAP + grid_h + BOARD_MARGIN
    board = Image.new("RGB", (board_w, board_h), BG)
    draw = ImageDraw.Draw(board)
    draw.text((BOARD_MARGIN, BOARD_MARGIN), BOARD_TITLE, font=title_font, fill=INK, anchor="lt")
    origin_y = BOARD_MARGIN + title_h + TILE_GAP
    for index, slide in enumerate(slides):
        column = index % TILE_COLUMNS
        row = index // TILE_COLUMNS
        tile = slide.resize((TILE_W, TILE_H), Image.Resampling.LANCZOS)
        board.paste(
            tile,
            (
                BOARD_MARGIN + column * (TILE_W + TILE_GAP),
                origin_y + row * (TILE_H + TILE_GAP),
            ),
        )
    return board


def rgb(value: object) -> tuple[int, int, int]:
    if not isinstance(value, tuple) or len(value) != 3:
        raise SystemExit(f"Expected an RGB tuple, got {value!r}")
    return (int(value[0]), int(value[1]), int(value[2]))


def require_mapping(spec: dict[str, object], key: str) -> dict[str, object]:
    value = spec[key]
    if not isinstance(value, dict):
        raise SystemExit(f"Direction A spec '{key}' must be a dict")
    return value


def detect_input_scale(
    image: Image.Image,
    logical_heights: tuple[int, ...] = (LOGICAL_PANEL[1],),
) -> int:
    """Return the integer pixel scale of a panel crop (1× is 420×661, 2× is 840×1322).

    Height may also match a declared bottom crop, such as 05b at 600×scale
    (1200px when the input is 2×).
    """
    logical_w = LOGICAL_PANEL[0]
    scale_x = image.width / logical_w
    nearest = round(scale_x)
    if nearest < 1 or abs(scale_x - nearest) > 0.03:
        raise SystemExit(
            f"Panel is {image.size[0]}×{image.size[1]}, expected a width that is an integer "
            f"multiple of {logical_w} (measured scale x={scale_x:.3f})."
        )
    for logical_h in logical_heights:
        scale_y = image.height / logical_h
        if abs(scale_y - nearest) <= 0.03:
            return nearest
    expected = ", ".join(str(logical_h * nearest) for logical_h in logical_heights)
    raise SystemExit(
        f"Panel is {image.size[0]}×{image.size[1]}, expected height {expected} at {nearest}×."
    )


def markup_runs(text: str) -> list[tuple[str, bool]]:
    """Split ``**bold**`` markers. A newline stays inside its run; callers split lines first."""
    parts = text.split("**")
    runs: list[tuple[str, bool]] = []
    bold = False
    for part in parts:
        if part:
            runs.append((part, bold))
        bold = not bold
    return runs


def measure_chars(
    chars: list[tuple[str, bool]],
    regular: ImageFont.FreeTypeFont,
    bold: ImageFont.FreeTypeFont,
) -> float:
    if not chars:
        return 0.0
    width = 0.0
    buffer = chars[0][0]
    is_bold = chars[0][1]
    for char, char_bold in chars[1:]:
        if char_bold == is_bold:
            buffer += char
            continue
        width += (bold if is_bold else regular).getlength(buffer)
        buffer = char
        is_bold = char_bold
    width += (bold if is_bold else regular).getlength(buffer)
    return width


def wrap_markup_line(
    runs: list[tuple[str, bool]],
    regular: ImageFont.FreeTypeFont,
    bold: ImageFont.FreeTypeFont,
    max_width: float,
) -> list[list[tuple[str, bool]]]:
    chars: list[tuple[str, bool]] = [(char, is_bold) for text, is_bold in runs for char in text]
    if not chars:
        return []
    lines: list[list[tuple[str, bool]]] = []
    start = 0
    index = 0
    last_space: int | None = None
    while index < len(chars):
        width = measure_chars(chars[start : index + 1], regular, bold)
        if width > max_width and index > start:
            break_at = last_space if last_space is not None and last_space > start else index
            lines.append(group_chars(chars[start:break_at]))
            start = break_at
            while start < len(chars) and chars[start][0] == " ":
                start += 1
            index = start
            last_space = None
            continue
        if chars[index][0] == " ":
            last_space = index
        index += 1
    if start < len(chars):
        lines.append(group_chars(chars[start:]))
    return [line for line in lines if line]


def group_chars(chars: list[tuple[str, bool]]) -> list[tuple[str, bool]]:
    while chars and chars[-1][0] == " ":
        chars = chars[:-1]
    if not chars:
        return []
    grouped: list[tuple[str, bool]] = []
    buffer = chars[0][0]
    is_bold = chars[0][1]
    for char, char_bold in chars[1:]:
        if char_bold == is_bold:
            buffer += char
            continue
        grouped.append((buffer, is_bold))
        buffer = char
        is_bold = char_bold
    grouped.append((buffer, is_bold))
    return grouped


def composite_shadow(
    canvas: Image.Image,
    mask: Image.Image,
    origin: tuple[int, int],
    *,
    blur: int,
    offset: tuple[int, int],
    opacity: float,
    color: tuple[int, int, int],
) -> None:
    shadow_mask = Image.new("L", canvas.size, 0)
    shadow_mask.paste(mask, (origin[0] + int(offset[0]), origin[1] + int(offset[1])))
    blurred = shadow_mask.filter(ImageFilter.GaussianBlur(blur))
    alpha = blurred.point(lambda value: int(value * opacity + 0.5))
    shadow = Image.new("RGBA", canvas.size, (*color, 0))
    shadow.putalpha(alpha)
    canvas.alpha_composite(shadow)


def logical_crop(image: Image.Image, source: dict[str, object], input_scale: int) -> Image.Image:
    """Crop a 1× source rect. Coordinates are scaled by the detected input scale."""
    x = int(round(float(source["x0"]) * input_scale))
    y = int(round(float(source["y0"]) * input_scale))
    right = int(round(float(source["x1"]) * input_scale))
    bottom = int(round(float(source["y1"]) * input_scale))
    if x < 0 or y < 0 or right > image.width or bottom > image.height or right <= x or bottom <= y:
        raise SystemExit(
            f"Loupe source {source} at {input_scale}× is ({x}, {y})-({right}, {bottom}), "
            f"outside the {image.size[0]}×{image.size[1]} panel."
        )
    return image.crop((x, y, right, bottom))


def caption_lines(
    parts: list[dict[str, object]],
    regular: ImageFont.FreeTypeFont,
    bold: ImageFont.FreeTypeFont,
    max_width: float,
) -> list[list[tuple[str, int]]]:
    """One line when it fits. Otherwise break between the regular prefix and the bold part."""
    segments = [(str(part["text"]), int(part["weight"])) for part in parts]

    def font_for(weight: int) -> ImageFont.FreeTypeFont:
        return bold if weight >= 700 else regular

    def width_of(line: list[tuple[str, int]]) -> float:
        return sum(font_for(weight).getlength(text) for text, weight in line)

    if width_of(segments) <= max_width:
        return [segments]
    bold_at = next((index for index, (_, weight) in enumerate(segments) if weight >= 700), None)
    if bold_at is None or bold_at == 0:
        raise SystemExit(f"Caption exceeds {max_width}px and has no regular/bold break: {segments!r}")
    first = segments[:bold_at]
    text, weight = first[-1]
    first[-1] = (text.rstrip(), weight)
    first = [(text, weight) for text, weight in first if text]
    second = list(segments[bold_at:])
    text, weight = second[0]
    second[0] = (text.lstrip(), weight)
    lines = [line for line in (first, second) if line]
    for line in lines:
        measured = width_of(line)
        if measured > max_width:
            rendered = "".join(text for text, _weight in line)
            raise SystemExit(f"Caption line {rendered!r} is {measured:.1f}px, max {max_width}px.")
    return lines


def compose_loupe_slide(panel_image: Image.Image, spec: dict[str, object]) -> tuple[Image.Image, int]:
    canvas_spec = require_mapping(spec, "canvas")
    panel_spec = require_mapping(spec, "panel")
    loupe = require_mapping(spec, "loupe")
    caption = require_mapping(spec, "caption")
    note = require_mapping(spec, "note")
    source = loupe["source"]
    if not isinstance(source, dict):
        raise SystemExit("Loupe source must be a dict")
    expected_box = loupe["box"]
    if not isinstance(expected_box, dict):
        raise SystemExit("Loupe box must be a dict")
    expected_panel = panel_spec["box"]
    if not isinstance(expected_panel, dict):
        raise SystemExit("Panel box must be a dict")

    width = int(canvas_spec["width"])
    height = int(canvas_spec["height"])
    background = rgb(canvas_spec["background"])
    tint = rgb(canvas_spec["tint"])
    tint_width = int(canvas_spec["tint_width"])
    full = panel_image.convert("RGBA")
    crop_bottom = spec.get("crop_bottom")
    logical_heights = [LOGICAL_PANEL[1]]
    if isinstance(crop_bottom, int):
        logical_heights.append(crop_bottom)
    input_scale = detect_input_scale(full, tuple(logical_heights))
    if isinstance(crop_bottom, int):
        cut = int(round(crop_bottom * input_scale))
        full = full.crop((0, 0, full.width, cut))
        logical_height = crop_bottom
    else:
        logical_height = LOGICAL_PANEL[1]

    panel_scale = float(panel_spec["scale"])
    display = (
        round(LOGICAL_PANEL[0] * panel_scale),
        round(logical_height * panel_scale),
    )
    panel_origin = (int(panel_spec["x"]), (height - display[1]) // 2)
    if (
        panel_origin[0] != int(expected_panel["x"])
        or panel_origin[1] != int(expected_panel["y"])
        or display != (int(expected_panel["w"]), int(expected_panel["h"]))
    ):
        raise SystemExit(
            f"Panel renders at {panel_origin} {display[0]}×{display[1]}, "
            f"spec box is {expected_panel}."
        )

    panel = full.resize(display, Image.Resampling.LANCZOS)
    panel_mask = rounded_mask(display, int(panel_spec["radius"]))
    base = Image.new("RGB", (width, height), background)
    ImageDraw.Draw(base).rectangle((0, 0, tint_width - 1, height - 1), fill=tint)
    canvas = base.convert("RGBA")
    panel_offset = panel_spec["offset"]
    if not isinstance(panel_offset, tuple):
        raise SystemExit("Panel shadow offset must be a tuple")
    composite_shadow(
        canvas,
        panel_mask,
        panel_origin,
        blur=int(panel_spec["blur"]),
        offset=(int(panel_offset[0]), int(panel_offset[1])),
        opacity=float(panel_spec["opacity"]),
        color=rgb(panel_spec["color"]),
    )
    clipped = panel.copy()
    clipped.putalpha(panel_mask)
    canvas.paste(clipped, panel_origin, clipped)

    crop = logical_crop(full, source, input_scale)
    x0 = float(source["x0"])
    y0 = float(source["y0"])
    loupe_w = round((float(source["x1"]) - x0) * float(loupe["scale"]))
    loupe_h = round((float(source["y1"]) - y0) * float(loupe["scale"]))
    loupe_x = int(loupe["x"])
    if "y" in loupe:
        loupe_y = int(loupe["y"])
    else:
        loupe_y = round(panel_origin[1] + y0 * panel_scale + float(loupe["y_nudge"]))
        loupe_y = min(loupe_y, height - int(loupe["clamp_bottom"]) - loupe_h)
    if (loupe_x, loupe_y, loupe_w, loupe_h) != (
        int(expected_box["x"]),
        int(expected_box["y"]),
        int(expected_box["w"]),
        int(expected_box["h"]),
    ):
        raise SystemExit(
            f"Loupe renders at ({loupe_x}, {loupe_y}) {loupe_w}×{loupe_h}, spec box is {expected_box}."
        )
    caption_limit = int(caption["x"]) - 60
    if loupe_x + loupe_w > caption_limit:
        raise SystemExit(f"Loupe right edge {loupe_x + loupe_w} passes {caption_limit}.")

    magnified = crop.resize((loupe_w, loupe_h), Image.Resampling.LANCZOS)
    loupe_mask = rounded_mask((loupe_w, loupe_h), int(loupe["radius"]))
    magnified.putalpha(loupe_mask)
    loupe_offset = loupe["offset"]
    if not isinstance(loupe_offset, tuple):
        raise SystemExit("Loupe shadow offset must be a tuple")
    composite_shadow(
        canvas,
        loupe_mask,
        (loupe_x, loupe_y),
        blur=int(loupe["blur"]),
        offset=(int(loupe_offset[0]), int(loupe_offset[1])),
        opacity=float(loupe["opacity"]),
        color=rgb(loupe["color"]),
    )
    canvas.paste(magnified, (loupe_x, loupe_y), magnified)

    flat = Image.new("RGB", (width, height), background)
    flat.paste(canvas, (0, 0), canvas)
    draw = ImageDraw.Draw(flat)
    parts = caption["parts"]
    if not isinstance(parts, list):
        raise SystemExit("Caption parts must be a list")
    regular = inter(int(caption["size"]), int(caption["weight"]))
    bold = inter(int(caption["size"]), int(caption["bold_weight"]))
    subtitle = spec.get("subtitle")
    line_y = int(caption["y_with_subtitle"] if isinstance(subtitle, dict) else caption["y"])
    max_width = float(caption["max_width"])
    color = rgb(caption["color"])
    for line in caption_lines(parts, regular, bold, max_width):
        baseline = line_y + int(caption["baseline_offset"])
        cursor = int(caption["x"])
        for text, weight in line:
            font = bold if weight >= 700 else regular
            draw.text((cursor, baseline), text, font=font, fill=color, anchor="ls")
            cursor += font.getlength(text)
        line_y += int(caption["line_height"])
    if isinstance(subtitle, dict):
        subtitle_font = inter(int(subtitle["size"]), int(subtitle["weight"]))
        subtitle_color = rgb(subtitle["color"])
        subtitle_y = line_y + int(subtitle["gap"])
        lines = subtitle["lines"]
        if not isinstance(lines, list) or not lines:
            raise SystemExit("Subtitle lines must be a non-empty list")
        for raw_line in lines:
            sentence = str(raw_line)
            words = sentence.split()
            if len(words) < 2:
                raise SystemExit(f"Subtitle line is a single word: {sentence!r}")
            measured = subtitle_font.getlength(sentence)
            if measured > max_width:
                raise SystemExit(f"Subtitle line {sentence!r} is {measured:.1f}px, max {max_width}px.")
            draw.text(
                (int(caption["x"]), subtitle_y),
                sentence,
                font=subtitle_font,
                fill=subtitle_color,
                anchor="lt",
            )
            subtitle_y += int(subtitle["line_height"])
    note_font = inter(int(note["size"]), int(note["weight"]))
    draw.text(
        (int(note["x"]), int(note["y"])),
        str(note["text"]),
        font=note_font,
        fill=rgb(note["color"]),
        anchor=str(note.get("anchor", "ls")),
    )
    if flat.mode != "RGB" or flat.size != (width, height):
        raise SystemExit(f"Frame is {flat.mode} {flat.size}, expected RGB {width}×{height}.")
    return flat, input_scale


def compose_direction_b() -> int:
    if not FONT_PATH.is_file():
        raise SystemExit(f"Missing vendored font: {FONT_PATH}")

    caption_font = inter(40, 600)
    subtitle_font = inter(22, 400)
    note_font = inter(13, 400)
    title_font = inter(28, 600)

    checked: list[tuple[dict[str, object], Path]] = []
    mismatches: list[str] = []
    for spec in SLIDES:
        filename = str(spec["file"])
        source = PANEL_DIR / filename
        prefix = EXPECTED_INPUT_PREFIXES[filename]
        if not source.is_file():
            mismatches.append(filename)
            print(f"input  {filename} MISSING (expected {prefix}…)")
            continue
        digest = sha256(source)
        matched = digest.startswith(prefix)
        if not matched:
            mismatches.append(filename)
        print(f"input  {filename} {digest} {'MATCH' if matched else 'MISMATCH'} (expected {prefix}…)")
        checked.append((spec, source))

    if mismatches:
        print(
            "Input panel crop hash mismatch: "
            f"{', '.join(mismatches)}. No final was written.",
            file=sys.stderr,
        )
        return 1

    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    slides: list[Image.Image] = []

    for spec, source in checked:
        filename = str(spec["file"])
        crop_bottom = spec.get("crop_bottom")
        panel = prepare_panel(source, int(crop_bottom) if isinstance(crop_bottom, int) else None)
        slide = compose_slide(
            panel,
            str(spec["caption"]),
            str(spec["subtitle"]) if "subtitle" in spec else None,
            caption_font,
            subtitle_font,
            note_font,
        )
        if slide.size != (WIDTH, HEIGHT):
            raise SystemExit(f"{filename} is {slide.size}, expected {(WIDTH, HEIGHT)}")
        destination = FINAL_DIR / filename
        slide.save(destination, "PNG")
        slides.append(slide)
        print(f"output {filename} {sha256(destination)} {slide.size[0]}x{slide.size[1]}")

    board = compose_board(slides, title_font)
    board_path = FINAL_DIR / "board.png"
    board.save(board_path, "PNG")
    print(f"output board.png {sha256(board_path)} {board.size[0]}x{board.size[1]}")
    print(f"Pillow {Image.__version__ if hasattr(Image, '__version__') else 'unknown'}")
    return 0


def compose_direction_a() -> int:
    if not FONT_PATH.is_file():
        raise SystemExit(f"Missing vendored font: {FONT_PATH}")

    pending: list[tuple[str, Path, dict[str, object]]] = []
    for filename, spec in DIRECTION_A.items():
        source = DIRECTION_A_PANEL_DIR / filename
        if not source.is_file():
            print(f"input  {filename} MISSING", file=sys.stderr)
            return 1
        pending.append((filename, source, spec))

    DIRECTION_A_DIR.mkdir(parents=True, exist_ok=True)
    for filename, source, spec in pending:
        panel = Image.open(source)
        slide, input_scale = compose_loupe_slide(panel, spec)
        canvas = require_mapping(spec, "canvas")
        expected = (int(canvas["width"]), int(canvas["height"]))
        if slide.mode != "RGB" or slide.size != expected:
            raise SystemExit(
                f"{filename} is {slide.mode} {slide.size[0]}×{slide.size[1]}, expected RGB {expected[0]}×{expected[1]}"
            )
        destination = DIRECTION_A_DIR / filename
        slide.save(destination, "PNG")
        print(
            f"input  {filename} scale={input_scale} {panel.size[0]}x{panel.size[1]} {sha256(source)}"
        )
        print(f"output {filename} {sha256(destination)} {slide.size[0]}x{slide.size[1]}")
    print(f"Pillow {Image.__version__ if hasattr(Image, '__version__') else 'unknown'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compose Chrome Web Store frames from panel crops.")
    parser.add_argument(
        "--direction",
        choices=("a", "b"),
        default="b",
        help="A draws the loupe callout. B draws the approved caption-left finals (default).",
    )
    args = parser.parse_args(argv)
    if args.direction == "a":
        return compose_direction_a()
    return compose_direction_b()


if __name__ == "__main__":
    raise SystemExit(main())
