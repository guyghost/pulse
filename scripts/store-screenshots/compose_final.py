#!/usr/bin/env python3
"""Compose the approved Chrome Web Store finals from the committed panel crops.

Reads ``docs/store-screenshots/0.2.5/panel/`` and writes
``docs/store-screenshots/0.2.5/final/``. This is the direction-B composition:
one 1280×800 frame per approved screen, plus ``board.png``. No A/B or mix
variants are written.

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


def main() -> int:
    if not FONT_PATH.is_file():
        raise SystemExit(f"Missing vendored font: {FONT_PATH}")

    caption_font = inter(40, 600)
    subtitle_font = inter(22, 400)
    note_font = inter(13, 400)
    title_font = inter(28, 600)

    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    slides: list[Image.Image] = []
    mismatch = False

    for spec in SLIDES:
        filename = str(spec["file"])
        source = PANEL_DIR / filename
        digest = sha256(source)
        prefix = EXPECTED_INPUT_PREFIXES[filename]
        status = "MATCH" if digest.startswith(prefix) else "MISMATCH"
        if status != "MATCH":
            mismatch = True
        print(f"input  {filename} {digest} {status} (expected {prefix}…)")

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
    if mismatch:
        print("Input panel crop hash mismatch.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
