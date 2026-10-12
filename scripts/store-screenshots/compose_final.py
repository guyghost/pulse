#!/usr/bin/env python3
"""Compose Chrome Web Store frames from the committed panel crops.

Direction B (default, ``pnpm store-screenshots:final``) writes the approved
1280×800 finals to ``docs/store-screenshots/0.2.5/final/``, plus ``board.png``.

Direction A (``pnpm store-screenshots:final:a``) writes sample loupe frames to
``docs/store-screenshots/0.2.5/direction-a/``. Each screen is one dict in
``DIRECTION_A``: panel position and scale, loupe source rect (logical 1×
panel pixels), loupe dest rect, zoom, caption box, font sizes and weights,
and colors. Caption text accepts ``**bold**`` segments. Panel PNGs may be
1× (420×661) or an integer multiple such as 2×; the scale is detected from
the image size and source rects stay in logical pixels.

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

# Native side-panel crop. Direction A source rects are in this space.
LOGICAL_PANEL = (420, 661)
DIRECTION_A_DIR = ROOT / "docs" / "store-screenshots" / "0.2.5" / "direction-a"

# Placeholder loupe zones. Replace any screen dict with the design spec;
# every layout value lives here, nothing is hard-coded in the renderer.
DIRECTION_A: dict[str, dict[str, object]] = {
    "01b-feed-scrolled.png": {
        "canvas": {"width": 1280, "height": 800, "background": (245, 247, 250)},
        "panel": {
            "x": 64,
            "y": 80,
            "scale": 0.88,
            "radius": 16,
            "shadow_blur": 18,
            "shadow_offset": (0, 10),
            "shadow_opacity": 0.18,
            "shadow_color": (14, 26, 43),
        },
        "loupe": {
            "source": {"x": 16, "y": 122, "w": 388, "h": 160},
            "dest": {"x": 148, "y": 148, "w": 631, "h": 269},
            "zoom": 1.8,
            "border_width": 8,
            "border_color": (255, 255, 255),
            "radius": 24,
            "shadow_blur": 22,
            "shadow_offset": (0, 12),
            "shadow_opacity": 0.2,
            "shadow_color": (14, 26, 43),
        },
        "caption": {
            "text": "4 plateformes.\n**1 seul feed.**",
            "x": 860,
            "y": 292,
            "max_width": 360,
            "line_height": 52,
            "size": 40,
            "weight": 400,
            "bold_weight": 700,
            "color": (14, 26, 43),
            "bold_color": (14, 26, 43),
        },
        "note": {
            "text": "Données d'exemple",
            "x": 32,
            "y": 776,
            "anchor": "ls",
            "size": 13,
            "weight": 400,
            "color": (95, 107, 120),
        },
    },
    "02-mission-detail.png": {
        "canvas": {"width": 1280, "height": 800, "background": (245, 247, 250)},
        "panel": {
            "x": 64,
            "y": 80,
            "scale": 0.88,
            "radius": 16,
            "shadow_blur": 18,
            "shadow_offset": (0, 10),
            "shadow_opacity": 0.18,
            "shadow_color": (14, 26, 43),
        },
        "loupe": {
            "source": {"x": 20, "y": 145, "w": 380, "h": 160},
            "dest": {"x": 156, "y": 156, "w": 618, "h": 269},
            "zoom": 1.8,
            "border_width": 8,
            "border_color": (255, 255, 255),
            "radius": 24,
            "shadow_blur": 22,
            "shadow_offset": (0, 12),
            "shadow_opacity": 0.2,
            "shadow_color": (14, 26, 43),
        },
        "caption": {
            "text": "Le score **explique**.\nTu décides.",
            "x": 860,
            "y": 292,
            "max_width": 360,
            "line_height": 52,
            "size": 40,
            "weight": 400,
            "bold_weight": 700,
            "color": (14, 26, 43),
            "bold_color": (14, 26, 43),
        },
        "note": {
            "text": "Données d'exemple",
            "x": 32,
            "y": 776,
            "anchor": "ls",
            "size": 13,
            "weight": 400,
            "color": (95, 107, 120),
        },
    },
    "03-filters-settings.png": {
        "canvas": {"width": 1280, "height": 800, "background": (245, 247, 250)},
        "panel": {
            "x": 64,
            "y": 80,
            "scale": 0.88,
            "radius": 16,
            "shadow_blur": 18,
            "shadow_offset": (0, 10),
            "shadow_opacity": 0.18,
            "shadow_color": (14, 26, 43),
        },
        "loupe": {
            "source": {"x": 16, "y": 84, "w": 388, "h": 114},
            "dest": {"x": 148, "y": 176, "w": 631, "h": 197},
            "zoom": 1.8,
            "border_width": 8,
            "border_color": (255, 255, 255),
            "radius": 24,
            "shadow_blur": 22,
            "shadow_offset": (0, 12),
            "shadow_opacity": 0.2,
            "shadow_color": (14, 26, 43),
        },
        "caption": {
            "text": "**Ton profil**,\nton classement.",
            "x": 860,
            "y": 292,
            "max_width": 360,
            "line_height": 52,
            "size": 40,
            "weight": 400,
            "bold_weight": 700,
            "color": (14, 26, 43),
            "bold_color": (14, 26, 43),
        },
        "note": {
            "text": "Données d'exemple",
            "x": 32,
            "y": 776,
            "anchor": "ls",
            "size": 13,
            "weight": 400,
            "color": (95, 107, 120),
        },
    },
    "04-alerts.png": {
        "canvas": {"width": 1280, "height": 800, "background": (245, 247, 250)},
        "panel": {
            "x": 64,
            "y": 80,
            "scale": 0.88,
            "radius": 16,
            "shadow_blur": 18,
            "shadow_offset": (0, 10),
            "shadow_opacity": 0.18,
            "shadow_color": (14, 26, 43),
        },
        "loupe": {
            "source": {"x": 32, "y": 84, "w": 370, "h": 136},
            "dest": {"x": 160, "y": 164, "w": 602, "h": 231},
            "zoom": 1.8,
            "border_width": 8,
            "border_color": (255, 255, 255),
            "radius": 24,
            "shadow_blur": 22,
            "shadow_offset": (0, 12),
            "shadow_opacity": 0.2,
            "shadow_color": (14, 26, 43),
        },
        "caption": {
            "text": "**Tes alertes**,\ntes critères.",
            "x": 860,
            "y": 292,
            "max_width": 360,
            "line_height": 52,
            "size": 40,
            "weight": 400,
            "bold_weight": 700,
            "color": (14, 26, 43),
            "bold_color": (14, 26, 43),
        },
        "note": {
            "text": "Données d'exemple",
            "x": 32,
            "y": 776,
            "anchor": "ls",
            "size": 13,
            "weight": 400,
            "color": (95, 107, 120),
        },
    },
    "05b-local-privacy.png": {
        "canvas": {"width": 1280, "height": 800, "background": (245, 247, 250)},
        "panel": {
            "x": 64,
            "y": 80,
            "scale": 0.88,
            "radius": 16,
            "shadow_blur": 18,
            "shadow_offset": (0, 10),
            "shadow_opacity": 0.18,
            "shadow_color": (14, 26, 43),
        },
        "loupe": {
            "source": {"x": 32, "y": 176, "w": 360, "h": 140},
            "dest": {"x": 156, "y": 196, "w": 586, "h": 238},
            "zoom": 1.8,
            "border_width": 8,
            "border_color": (255, 255, 255),
            "radius": 24,
            "shadow_blur": 22,
            "shadow_offset": (0, 12),
            "shadow_opacity": 0.2,
            "shadow_color": (14, 26, 43),
        },
        "caption": {
            "text": "Par défaut,\n**tout reste en local.**",
            "x": 860,
            "y": 292,
            "max_width": 360,
            "line_height": 52,
            "size": 40,
            "weight": 400,
            "bold_weight": 700,
            "color": (14, 26, 43),
            "bold_color": (14, 26, 43),
        },
        "note": {
            "text": "Données d'exemple",
            "x": 32,
            "y": 776,
            "anchor": "ls",
            "size": 13,
            "weight": 400,
            "color": (95, 107, 120),
        },
    },
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


def detect_input_scale(image: Image.Image) -> int:
    """Return the integer pixel scale of a panel crop (1× is 420×661, 2× is 840×1322)."""
    logical_w, logical_h = LOGICAL_PANEL
    scale_x = image.width / logical_w
    scale_y = image.height / logical_h
    nearest = round(scale_x)
    if (
        nearest < 1
        or abs(scale_x - nearest) > 0.03
        or abs(scale_y - nearest) > 0.03
        or abs(scale_x - scale_y) > 0.03
    ):
        raise SystemExit(
            f"Panel is {image.size[0]}×{image.size[1]}, expected an integer multiple of "
            f"{logical_w}×{logical_h} (measured scale x={scale_x:.3f} y={scale_y:.3f})."
        )
    return nearest


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
    x = int(round(float(source["x"]) * input_scale))
    y = int(round(float(source["y"]) * input_scale))
    width = int(round(float(source["w"]) * input_scale))
    height = int(round(float(source["h"]) * input_scale))
    right = x + width
    bottom = y + height
    if x < 0 or y < 0 or right > image.width or bottom > image.height or width < 1 or height < 1:
        raise SystemExit(
            f"Loupe source {source} at {input_scale}× is ({x}, {y}, {width}×{height}), "
            f"outside the {image.size[0]}×{image.size[1]} panel."
        )
    return image.crop((x, y, right, bottom))


def resolve_loupe_box(
    loupe: dict[str, object],
    source: dict[str, object],
    panel_scale: float,
) -> tuple[int, int, int, int, int, int]:
    """Return dest origin plus outer and inner sizes. Explicit dest w/h win over zoom."""
    dest = loupe["dest"]
    if not isinstance(dest, dict):
        raise SystemExit("Loupe dest must be a dict")
    border = int(loupe["border_width"])
    dest_w = dest.get("w")
    dest_h = dest.get("h")
    if dest_w is None or dest_h is None:
        zoom = float(loupe["zoom"])
        inner_w = round(float(source["w"]) * panel_scale * zoom)
        inner_h = round(float(source["h"]) * panel_scale * zoom)
        outer_w = inner_w + border * 2
        outer_h = inner_h + border * 2
    else:
        outer_w = int(dest_w)
        outer_h = int(dest_h)
        inner_w = outer_w - border * 2
        inner_h = outer_h - border * 2
    if inner_w < 2 or inner_h < 2:
        raise SystemExit(f"Loupe inner size {inner_w}×{inner_h} is too small for border {border}.")
    return int(dest["x"]), int(dest["y"]), outer_w, outer_h, inner_w, inner_h


def draw_markup(
    draw: ImageDraw.ImageDraw,
    caption: dict[str, object],
    regular: ImageFont.FreeTypeFont,
    bold: ImageFont.FreeTypeFont,
) -> None:
    origin_x = int(caption["x"])
    origin_y = int(caption["y"])
    line_height = int(caption["line_height"])
    max_width = float(caption["max_width"])
    color = rgb(caption["color"])
    bold_color = rgb(caption["bold_color"])
    y = origin_y
    for raw_line in str(caption["text"]).split("\n"):
        wrapped = wrap_markup_line(markup_runs(raw_line), regular, bold, max_width)
        if not wrapped:
            y += line_height
            continue
        for line in wrapped:
            x = origin_x
            for segment, is_bold in line:
                font = bold if is_bold else regular
                draw.text((x, y), segment, font=font, fill=bold_color if is_bold else color, anchor="lt")
                x += font.getlength(segment)
            y += line_height


def compose_loupe_slide(panel_image: Image.Image, spec: dict[str, object]) -> tuple[Image.Image, int]:
    canvas_spec = require_mapping(spec, "canvas")
    panel_spec = require_mapping(spec, "panel")
    loupe = require_mapping(spec, "loupe")
    caption = require_mapping(spec, "caption")
    note = require_mapping(spec, "note")
    source = loupe["source"]
    if not isinstance(source, dict):
        raise SystemExit("Loupe source must be a dict")

    width = int(canvas_spec["width"])
    height = int(canvas_spec["height"])
    background = rgb(canvas_spec["background"])
    input_scale = detect_input_scale(panel_image)
    panel_scale = float(panel_spec["scale"])
    display = (
        round(LOGICAL_PANEL[0] * panel_scale),
        round(LOGICAL_PANEL[1] * panel_scale),
    )
    panel = panel_image.convert("RGBA").resize(display, Image.Resampling.LANCZOS)
    panel_origin = (int(panel_spec["x"]), int(panel_spec["y"]))
    panel_mask = rounded_mask(display, int(panel_spec["radius"]))

    canvas = Image.new("RGBA", (width, height), (*background, 255))
    panel_offset = panel_spec["shadow_offset"]
    if not isinstance(panel_offset, tuple):
        raise SystemExit("Panel shadow_offset must be a tuple")
    composite_shadow(
        canvas,
        panel_mask,
        panel_origin,
        blur=int(panel_spec["shadow_blur"]),
        offset=(int(panel_offset[0]), int(panel_offset[1])),
        opacity=float(panel_spec["shadow_opacity"]),
        color=rgb(panel_spec["shadow_color"]),
    )
    clipped = panel.copy()
    clipped.putalpha(panel_mask)
    canvas.paste(clipped, panel_origin, clipped)

    crop = logical_crop(panel_image.convert("RGBA"), source, input_scale)
    dest_x, dest_y, outer_w, outer_h, inner_w, inner_h = resolve_loupe_box(loupe, source, panel_scale)
    border = int(loupe["border_width"])
    radius = int(loupe["radius"])
    magnified = crop.resize((inner_w, inner_h), Image.Resampling.LANCZOS)
    inner_mask = rounded_mask((inner_w, inner_h), max(0, radius - border))
    magnified.putalpha(inner_mask)
    plate = Image.new("RGBA", (outer_w, outer_h), (*rgb(loupe["border_color"]), 255))
    outer_mask = rounded_mask((outer_w, outer_h), radius)
    plate.putalpha(outer_mask)
    plate.paste(magnified, (border, border), magnified)

    loupe_offset = loupe["shadow_offset"]
    if not isinstance(loupe_offset, tuple):
        raise SystemExit("Loupe shadow_offset must be a tuple")
    composite_shadow(
        canvas,
        outer_mask,
        (dest_x, dest_y),
        blur=int(loupe["shadow_blur"]),
        offset=(int(loupe_offset[0]), int(loupe_offset[1])),
        opacity=float(loupe["shadow_opacity"]),
        color=rgb(loupe["shadow_color"]),
    )
    canvas.alpha_composite(plate, (dest_x, dest_y))

    flat = Image.new("RGB", (width, height), background)
    flat.paste(canvas, (0, 0), canvas)
    draw = ImageDraw.Draw(flat)
    draw_markup(
        draw,
        caption,
        inter(int(caption["size"]), int(caption["weight"])),
        inter(int(caption["size"]), int(caption["bold_weight"])),
    )
    note_font = inter(int(note["size"]), int(note["weight"]))
    draw.text(
        (int(note["x"]), int(note["y"])),
        str(note["text"]),
        font=note_font,
        fill=rgb(note["color"]),
        anchor=str(note.get("anchor", "ls")),
    )
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
        source = PANEL_DIR / filename
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
        if slide.size != expected:
            raise SystemExit(f"{filename} is {slide.size[0]}×{slide.size[1]}, expected {expected[0]}×{expected[1]}")
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
