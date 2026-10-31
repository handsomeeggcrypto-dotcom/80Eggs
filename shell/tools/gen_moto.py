#!/usr/bin/env python3
"""Shrinks MOEtorcycles art (3 rides, 5 maps) for SHELL's 320x240 screen.

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

SCALE = 3          # the full game is 3x taller than SHELL's screen
RIDES = {"eggs": 80, "crayons": 68, "poki": 48}     # 150 * the ride's scale / 3, its height in the game
MAPS = ["eggs", "crayons", "moemoe", "glitch", "miami"]
STRIP_MAPS = ["eggs", "crayons"]   # their foreground is low enough to keep as a moving strip


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


def layer(m, name, h=240):
    im = Image.open(GAME / "bg" / f"{m}_{name}.png").convert("RGBA")
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


FRONT_TOP = 160   # the see-through strip starts at this row


def backgrounds(m, out):
    # see-through layers are slow to draw on SHELL, so sky + far + mid are baked into
    # one solid layer, and only a bottom strip of the near layer stays see-through.
    # The other maps' foregrounds (palms, cats, bus stops) are too tall for a strip,
    # so they're baked in too.
    back = layer(m, "sky")
    back.alpha_composite(layer(m, "far"))
    back.alpha_composite(layer(m, "mid"))
    front = layer(m, "near")
    if m in STRIP_MAPS:
        to_bmp(front.crop((0, FRONT_TOP, front.width, front.height))).save(out / "front.bmp", "BMP")
    else:
        back.alpha_composite(front)
    back.convert("RGB").save(out / "back.bmp", "BMP")


def ride(r, h, out):
    for pose in ["ride", "wheelie", "air", "land", "crash"]:
        im = Image.open(GAME / f"player_{r}_{pose}.png").convert("RGBA")
        w = round(im.width * h / im.height)
        to_bmp(im.resize((w, h), Image.LANCZOS)).save(out / f"{pose}.bmp", "BMP")


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


def crayon(h):
    w = 26
    img = Image.new("RGB", (w, h), PINK)
    d = ImageDraw.Draw(img)
    tip = 8
    d.polygon([(13, 0), (19, tip), (7, tip)], fill=(255, 77, 109), outline=(18, 3, 10))
    d.rectangle([7, tip, 19, h - 1], fill=(255, 77, 109), outline=(18, 3, 10))
    d.rectangle([8, tip + 4, 18, h - 5], fill=(255, 210, 63))
    d.line([(8, tip + 4), (18, tip + 4)], fill=(18, 3, 10))
    d.line([(8, h - 5), (18, h - 5)], fill=(18, 3, 10))
    return img


def emoji(h):
    """A stack of heart-eyes faces with a red ring so it reads against the emoji sky."""
    w = 26
    img = Image.new("RGB", (w, h), PINK)
    d = ImageDraw.Draw(img)
    n = 2
    size = h // n
    for i in range(n):
        y = h - size * (i + 1)
        x0, x1 = (w - size) // 2, (w + size) // 2 - 1
        d.ellipse([x0, y, x1, y + size - 1], fill=(245, 182, 12), outline=(255, 42, 70))
        cx = (x0 + x1) // 2
        for ex in (cx - 3, cx + 3):
            d.rectangle([ex - 1, y + 3, ex + 1, y + 5], fill=(255, 42, 70))
        d.line([(cx - 2, y + size - 4), (cx + 2, y + size - 4)], fill=(90, 61, 0))
    return img


def cone(h):
    w = 26
    img = Image.new("RGB", (w, h), PINK)
    d = ImageDraw.Draw(img)
    d.polygon([(13, 0), (21, h - 5), (5, h - 5)], fill=(255, 122, 26), outline=(58, 21, 0))
    y1, y2 = h * 35 // 100, h * 55 // 100
    d.polygon([(13 - (y1 * 8 // h), y1), (13 + (y1 * 8 // h), y1), (13 + (y2 * 8 // h), y2), (13 - (y2 * 8 // h), y2)], fill=(255, 255, 255))
    d.rectangle([1, h - 5, 25, h - 1], fill=(199, 74, 0), outline=(58, 21, 0))
    return img


def umbrella(h):
    w = 26
    img = Image.new("RGB", (w, h), PINK)
    d = ImageDraw.Draw(img)
    d.rectangle([12, 8, 14, h - 1], fill=(122, 83, 39))
    d.pieslice([0, 0, 25, 24], 180, 360, fill=(255, 59, 92), outline=(58, 13, 28))
    d.pieslice([8, 0, 17, 24], 180, 360, fill=(255, 242, 224), outline=(58, 13, 28))
    d.rectangle([9, h - 3, 17, h - 1], fill=(255, 210, 63), outline=(58, 13, 28))
    return img


HAZARDS = {"eggs": hay, "crayons": crayon, "moemoe": emoji, "glitch": cone, "miami": umbrella}


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
    for m in MAPS:
        out = OUT / "maps" / m
        out.mkdir(parents=True, exist_ok=True)
        backgrounds(m, out)
        for h in (22, 26, 30):
            HAZARDS[m](h).save(out / f"haz{h}.bmp", "BMP")
    for r, h in RIDES.items():
        out = OUT / "rides" / r
        out.mkdir(parents=True, exist_ok=True)
        ride(r, h, out)
    star().save(OUT / "star.bmp", "BMP")
    ring().save(OUT / "ring.bmp", "BMP")
    title("MOETORCYCLES", 32, YOLK).save(OUT / "title.bmp", "BMP")
    for m in ["great", "good", "ok", "sus", "shock", "love", "dying"]:
        yolk_face(m, 1).save(OUT / f"yolk_{m}.bmp", "BMP")
    print("moto art written to", OUT)
