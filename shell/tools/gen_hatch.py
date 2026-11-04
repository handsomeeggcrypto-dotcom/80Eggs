#!/usr/bin/env python3
"""Draws the HATCHERY's eggs as BMPs for Rockbox: an egg warming up in five
stages (more cracks, more glow), plus the empty shell left after a hatch.

  python3 tools/gen_hatch.py   -> root/YOLK/hatch/egg0.bmp ... egg4.bmp, shell.bmp

Pixel art at 24x30, scaled 4x to 96x120. Pure magenta is see-through.
"""
import random
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "root" / "YOLK" / "hatch"
PINK = (255, 0, 255)
SHELL = (242, 234, 219)
SHADE = (196, 182, 160)
LINE = (60, 44, 10)
SPOT = (255, 194, 26)
CRACK = (24, 16, 6)
GLOW = (255, 230, 120)
W, H, S = 24, 30, 4


def inside(x, y):
    """An egg: rounder at the bottom, narrower at the top."""
    cx, cy = (W - 1) / 2, H * 0.57
    ry = H * 0.43 if y < cy else H * 0.42
    rx = W * 0.44 * (1 - 0.22 * max(0.0, (cy - y) / ry))
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1


# cracks: (stage they appear at, list of pixels), drawn as zigzags
CRACKS = [
    (1, [(15, 9), (14, 10), (15, 11), (14, 12)]),
    (2, [(6, 15), (7, 14), (8, 15), (9, 14), (10, 15)]),
    (2, [(14, 12), (13, 13), (14, 14)]),
    (3, [(10, 15), (11, 16), (12, 15), (13, 16), (14, 15), (15, 16), (16, 15), (17, 16)]),
    (3, [(9, 6), (10, 7), (9, 8), (10, 9)]),
    (4, [(4, 20), (5, 19), (6, 20), (7, 19), (8, 20)]),
    (4, [(17, 16), (18, 17), (19, 16), (18, 18)]),
]


def egg(stage):
    random.seed(7)   # same speckles every time
    img = Image.new("RGB", (W, H), PINK)
    px = img.load()
    for y in range(H):
        for x in range(W):
            if not inside(x, y):
                continue
            edge = not all(inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge:
                px[x, y] = LINE
            elif not inside(x + 3, y - 2):              # a crescent of shadow on the lower right
                px[x, y] = SHADE
            else:
                px[x, y] = SHELL
    for _ in range(9):                                   # yolk-colored speckles
        x, y = random.randrange(4, W - 4), random.randrange(6, H - 4)
        if inside(x - 1, y) and inside(x + 1, y) and px[x, y] != LINE:
            px[x, y] = SPOT
    px[7, 8], px[7, 9], px[8, 7] = (255, 255, 255), (255, 255, 255), (255, 255, 255)   # shine
    for at, pts in CRACKS:
        if stage >= at:
            for x, y in pts:
                if inside(x, y):
                    px[x, y] = CRACK
                    if stage >= 4 and inside(x, y + 1) and px[x, y + 1] not in (CRACK, LINE):
                        px[x, y + 1] = GLOW     # light leaking through
    return img.resize((W * S, H * S), Image.NEAREST)


def empty_shell():
    """The bottom half left behind, with a jagged top."""
    img = egg(4)
    px = img.load()
    for y in range(H * S):
        for x in range(W * S):
            col = x // S
            cut = 15 + (col % 2) * 1 if col % 4 < 2 else 16 - (col % 2)
            if y // S < cut:
                px[x, y] = PINK
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for stage in range(5):
        egg(stage).save(OUT / f"egg{stage}.bmp", "BMP")
    empty_shell().save(OUT / "shell.bmp", "BMP")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
