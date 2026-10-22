#!/usr/bin/env python3
"""Shrinks MOEtorcycles art (Eggs ride + Countryside) for SHELL's 320x240 screen.

  python3 tools/gen_moto.py  -> root/YOLK/moto/

The full game is 1280x720, so everything is drawn at 1/3 scale here.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "root" / "YOLK" / "moto"
GAME = Path.home() / "80Eggs" / "moetorcycles" / "assets"

sys.path.insert(0, str(HERE))
from gen_art import title, yolk_face, PINK, YOLK  # noqa: E402

RIDE = "eggs"
MAP = "eggs"
SCALE = 3          # the full game is 3x taller than SHELL's screen
RIDE_H = 80        # 150 * 1.58 / 3, the Eggs ride's drawn height in the game


def to_bmp(rgba):
    """Rockbox BMPs have no alpha; pure magenta is its transparent colour."""
    rgba = rgba.convert("RGBA")
    out = Image.new("RGB", rgba.size, PINK)
    mask = rgba.split()[3].point(lambda a: 255 if a >= 128 else 0)
    out.paste(rgba.convert("RGB"), (0, 0), mask)
    # nudge any real magenta in the art so it doesn't turn see-through
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            if px[x, y] == PINK and mask.getpixel((x, y)):
                px[x, y] = (254, 0, 254)
    return out


def layer(name, h=240):
    im = Image.open(GAME / "bg" / f"{MAP}_{name}.png").convert("RGBA")
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def backgrounds():
    # sky + far baked into one solid layer (slow scroll), mid + near into one see-through layer
    back = layer("sky")
    back.alpha_composite(layer("far"))
    back.convert("RGB").save(OUT / "back.bmp", "BMP")
    front = layer("mid")
    front.alpha_composite(layer("near"))
    to_bmp(front).save(OUT / "front.bmp", "BMP")


def ride():
    for pose in ["ride", "wheelie", "air", "land", "crash"]:
        im = Image.open(GAME / f"player_{RIDE}_{pose}.png").convert("RGBA")
        w = round(im.width * RIDE_H / im.height)
        to_bmp(im.resize((w, RIDE_H), Image.LANCZOS)).save(OUT / f"ride_{pose}.bmp", "BMP")


def hay(h):
    """A hay bale like the game's (78 wide, 66-92 tall at full size)."""
    w = 26
    img = Image.new("RGB", (w, h), PINK)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=3, fill=(242, 206, 98), outline=(58, 42, 18))
    for y in range(4, h - 2, 4):                      # straw texture
        d.line([(3, y), (w - 4, y + 1)], fill=(185, 131, 46))
    for x in (7, w - 8):                              # twine
        d.line([(x, 1), (x, h - 2)], fill=(36, 16, 18), width=2)
    return img


def star():
    img = Image.new("RGB", (11, 11), PINK)
    d = ImageDraw.Draw(img)
    pts = [(5, 0), (6, 4), (10, 4), (7, 6), (8, 10), (5, 8), (2, 10), (3, 6), (0, 4), (4, 4)]
    d.polygon(pts, fill=YOLK, outline=(150, 100, 10))
    d.point((4, 4), fill=(255, 255, 220))
    return img


def ring():
    """The giant gold boost ring (r 58 at full size)."""
    s = 40
    img = Image.new("RGB", (s, s), PINK)
    d = ImageDraw.Draw(img)
    d.ellipse([1, 1, s - 2, s - 2], outline=(150, 100, 10), width=5)
    d.ellipse([2, 2, s - 3, s - 3], outline=YOLK, width=3)
    d.arc([3, 3, s - 4, s - 4], 200, 250, fill=(255, 245, 200), width=2)
    return img


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    backgrounds()
    ride()
    for h in (22, 26, 30):
        hay(h).save(OUT / f"hay{h}.bmp", "BMP")
    star().save(OUT / "star.bmp", "BMP")
    ring().save(OUT / "ring.bmp", "BMP")
    title("MOETORCYCLES", 32, YOLK).save(OUT / "title.bmp", "BMP")
    for m in ["great", "good", "ok", "sus", "shock", "love", "dying"]:
        yolk_face(m, 1).save(OUT / f"yolk_{m}.bmp", "BMP")
    print("moto art written to", OUT)
