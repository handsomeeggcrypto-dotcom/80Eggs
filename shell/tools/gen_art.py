#!/usr/bin/env python3
"""Draws SHELL's theme art (backdrop, YOLK's faces, progress bar) as BMPs for Rockbox.

Run from anywhere: python3 tools/gen_art.py  -> writes into root/.rockbox/...
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "root" / ".rockbox"
W, H = 320, 240

BG = (10, 8, 6)
SCAN = (16, 13, 9)
YOLK = (255, 194, 26)
YOLK_DIM = (120, 88, 16)
YOLK_DARK = (60, 44, 10)
SHELL = (242, 234, 219)
GLITCH = (255, 61, 110)
PINK = (255, 0, 255)  # Rockbox treats pure magenta as transparent


def save(img, rel):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(p, "BMP")


def backdrop():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for y in range(0, H, 2):
        d.line([(0, y), (W, y)], fill=SCAN)
    # a huge, barely-there egg behind everything
    d.ellipse([170, 30, 370, 290], outline=(26, 20, 12), width=2)
    d.ellipse([190, 56, 350, 270], outline=(20, 16, 10), width=1)
    # top + bottom bars
    d.rectangle([0, 0, W, 25], fill=(5, 4, 3))
    d.line([(0, 26), (W, 26)], fill=YOLK_DIM)
    d.rectangle([0, 219, W, H], fill=(5, 4, 3))
    d.line([(0, 218), (W, 218)], fill=YOLK_DIM)
    # HUD corner ticks around the menu area
    for x, y, dx, dy in [(4, 30, 1, 1), (315, 30, -1, 1), (4, 214, 1, -1), (315, 214, -1, -1)]:
        d.line([(x, y), (x + 8 * dx, y)], fill=YOLK_DIM)
        d.line([(x, y), (x, y + 8 * dy)], fill=YOLK_DIM)
    return img


# YOLK's face is pixel art on a 24x24 grid, scaled up so it stays crisp.
FACE_GRID = 24


def yolk_face(mood, scale):
    g = Image.new("RGB", (FACE_GRID, FACE_GRID), PINK)
    d = ImageDraw.Draw(g)
    c = YOLK if mood != "dying" else (200, 150, 20)
    # the yolk blob: a circle with a slightly squished bottom
    d.ellipse([2, 3, 21, 21], fill=c)
    d.ellipse([3, 2, 20, 19], fill=c)
    # shine
    d.rectangle([6, 5, 7, 6], fill=SHELL)
    d.point((8, 5), fill=SHELL)
    eye = (20, 14, 6)
    if mood == "great":      # big happy arcs ^ ^
        for ex in (8, 15):
            d.point((ex - 1, 12), fill=eye); d.point((ex, 11), fill=eye); d.point((ex + 1, 12), fill=eye)
        d.line([(10, 16), (13, 16)], fill=eye); d.point((9, 15), fill=eye); d.point((14, 15), fill=eye)
    elif mood == "good":     # open eyes, small smile
        for ex in (8, 15):
            d.rectangle([ex - 1, 10, ex, 12], fill=eye)
        d.line([(10, 16), (13, 16)], fill=eye)
    elif mood == "ok":       # flat stare
        for ex in (8, 15):
            d.rectangle([ex - 1, 11, ex, 12], fill=eye)
        d.line([(10, 16), (13, 16)], fill=eye)
    elif mood == "tired":    # half-lidded, frown
        for ex in (8, 15):
            d.line([(ex - 2, 11), (ex + 1, 11)], fill=eye)
            d.rectangle([ex - 1, 12, ex, 12], fill=eye)
        d.line([(10, 17), (13, 17)], fill=eye); d.point((9, 18), fill=eye); d.point((14, 18), fill=eye)
    elif mood == "dying":    # X eyes, glitch slice
        for ex in (8, 15):
            for i in range(-1, 2):
                d.point((ex + i, 11 + i), fill=eye); d.point((ex + i, 11 - i), fill=eye)
        d.line([(10, 17), (13, 17)], fill=eye)
        d.line([(2, 14), (21, 14)], fill=GLITCH)
    elif mood == "dream":    # closed eyes, Zz
        for ex in (8, 15):
            d.line([(ex - 1, 12), (ex + 1, 12)], fill=eye)
        d.point((11, 16), fill=eye); d.point((12, 16), fill=eye)
        z = (120, 220, 255)
        d.line([(18, 2), (21, 2)], fill=z); d.point((20, 3), fill=z); d.point((19, 4), fill=z); d.line([(18, 5), (21, 5)], fill=z)
    elif mood == "blink":    # used by the boot animation
        for ex in (8, 15):
            d.line([(ex - 1, 12), (ex + 1, 12)], fill=eye)
        d.line([(10, 16), (13, 16)], fill=eye)
    return g.resize((FACE_GRID * scale, FACE_GRID * scale), Image.NEAREST)


# order matches the %?bl<...> conditional in the skins: unknown, then low -> high
MOODS = ["ok", "dying", "tired", "ok", "good", "great"]


def face_strip(scale):
    frames = [yolk_face(m, scale) for m in MOODS] + [yolk_face("dream", scale)]
    s = FACE_GRID * scale
    strip = Image.new("RGB", (s, s * len(frames)))
    for i, f in enumerate(frames):
        strip.paste(f, (0, i * s))
    return strip


def progress_bar():
    img = Image.new("RGB", (300, 6), YOLK)
    d = ImageDraw.Draw(img)
    d.line([(0, 0), (300, 0)], fill=(255, 226, 140))
    return img


def title(text, size=32, color=YOLK):
    """Pre-rendered Terminus title (Lua apps can't load extra fonts at runtime)."""
    import tempfile
    from PIL import BdfFontFile, ImageFont
    bdf = Path(__file__).resolve().parent / "fonts" / f"{size}-Terminus-Bold.bdf"
    tmp = Path(tempfile.mkdtemp()) / "t"
    BdfFontFile.BdfFontFile(open(bdf, "rb")).save(str(tmp))
    font = ImageFont.load(str(tmp) + ".pil")
    l, t, r, b = font.getbbox(text)
    img = Image.new("RGB", (r - l + 2, b - t + 2), PINK)
    ImageDraw.Draw(img).text((1 - l, 1 - t), text, font=font, fill=color)
    return img


if __name__ == "__main__":
    save(backdrop(), "backdrops/yolk.bmp")
    save(face_strip(1), "wps/yolk/face-small.bmp")   # 24px, status bar
    save(face_strip(3), "wps/yolk/face-big.bmp")     # 72px, now playing
    save(progress_bar(), "wps/yolk/pb.bmp")
    for m in ["great", "good", "ok", "tired", "dying", "dream", "blink"]:
        save(yolk_face(m, 4), f"../YOLK/faces/{m}.bmp")  # 96px, for the Lua apps
    save(title("YOLK ONLINE"), "../YOLK/img/title.bmp")
    print("art written to", ROOT)
