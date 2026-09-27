#!/usr/bin/env python3
"""
Bubble shooter asset pipeline.

Source art lives in ~/Desktop/bubbles/. Those files are named .jpeg but are really
transparent PNGs; if a file has real transparency we use it as-is, otherwise (a
true JPEG on a flat WHITE background) we:
  1. flood-fill the white background in from the borders -> transparent
     (enclosed whites like icing sprinkles or a bubble's inner ring survive),
  2. feather the cut edge so it doesn't look jaggy,
  3. trim to content, centre on a square canvas, resize to SIZE.

Files named <kind>_slide_<n> (kind = good / bad / random; "randon" is accepted too)
are SLIDES, not bubbles: characters cut off flat along an edge so they can "peek" in
from a screen edge. The cut edges are detected automatically; each slide is turned
so its main cut is along the BOTTOM, trimmed, capped at SLIDE_MAX px, and written to
assets/slides/. assets/slides.json lists them with any extra cut sides ("left" /
"right") so the game only places a corner-peeker in a corner, etc.

Files named win_<n> / lose_<n> are end-of-game STICKERS and hamster_projectile* /
summon* / ghost* are special-move FX art. Both are trimmed to their content (not
squared), capped at FX_MAX px, and written to assets/stickers/ and assets/fx/;
the stickers are listed in assets/stickers.json.

Re-run any time the source art changes:  python3 build_assets.py
"""
import json
import os
import re
from collections import deque
from PIL import Image, ImageFilter

SRC = os.path.expanduser("~/Desktop/bubbles")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
SIZE = 256
SLIDE_MAX = 600
FX_MAX = 512
STICKER_RE = re.compile(r"^(win|lose)_", re.I)
FX_RE = re.compile(r"^(hamster_projectile|summon|ghost)", re.I)
SLIDE_RE = re.compile(r"^(good|bad|random|randon)_slide_", re.I)
CUT_MIN = 0.08  # an edge counts as "cut" if at least this much of it is opaque
WHITE = 232  # a pixel counts as background if every channel >= this


def has_alpha(im):
    return im.mode in ("RGBA", "LA") and im.getchannel("A").getextrema()[0] < 255


def key_white(im):
    if has_alpha(im):
        return im.convert("RGBA")
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    bg = bytearray(w * h)

    def is_bg(x, y):
        r, g, b = px[x, y]
        return r >= WHITE and g >= WHITE and b >= WHITE

    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if bg[i] or not is_bg(x, y):
            continue
        bg[i] = 1
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))

    alpha = Image.frombytes("L", (w, h), bytes(0 if b else 255 for b in bg))
    # feather: shrink by 1px then blur so the edge fades instead of stair-stepping
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def square(im):
    box = im.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
    im = im.crop(box)
    s = max(im.size)
    pad = int(s * 0.02)
    canvas = Image.new("RGBA", (s + pad * 2, s + pad * 2), (0, 0, 0, 0))
    canvas.paste(im, ((canvas.width - im.width) // 2, (canvas.height - im.height) // 2), im)
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def cut_edges(im):
    """How much of each border (2px deep) is opaque, as a fraction of its length."""
    a = im.getchannel("A").point(lambda v: 255 if v > 16 else 0)
    w, h = im.size

    def frac(box, length):
        hist = a.crop(box).histogram()
        return hist[255] / (length * 2)

    return {
        "top": frac((0, 0, w, 2), w),
        "bottom": frac((0, h - 2, w, h), w),
        "left": frac((0, 0, 2, h), h),
        "right": frac((w - 2, 0, w, h), h),
    }


def build_slide(src, dst):
    """Returns the extra cut sides (besides the bottom) after normalising."""
    im = key_white(Image.open(src))
    # cuts are measured on the ORIGINAL canvas borders (after trimming, every
    # side touches the art somewhere); turn the image so the biggest is the bottom
    cuts = cut_edges(im)
    main = max(cuts, key=cuts.get)
    im = {
        "bottom": im,
        "top": im.transpose(Image.ROTATE_180),
        "left": im.transpose(Image.ROTATE_90),    # counter-clockwise: left -> bottom
        "right": im.transpose(Image.ROTATE_270),  # clockwise: right -> bottom
    }[main]
    cuts = cut_edges(im)
    im = im.crop(im.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox())
    im.thumbnail((SLIDE_MAX, SLIDE_MAX), Image.LANCZOS)
    im.save(dst, optimize=True)
    return [side for side in ("left", "right") if cuts[side] >= CUT_MIN]


def main():
    os.makedirs(os.path.join(OUT, "slides"), exist_ok=True)
    names = sorted(f for f in os.listdir(SRC) if f.lower().endswith((".jpeg", ".jpg", ".png")))
    slides = {"good": [], "bad": [], "random": []}
    for f in names:
        m = SLIDE_RE.match(f)
        if not m:
            continue
        kind = {"randon": "random"}.get(m.group(1).lower(), m.group(1).lower())
        out = os.path.splitext(f)[0].lower() + ".png"
        cut = build_slide(os.path.join(SRC, f), os.path.join(OUT, "slides", out))
        slides[kind].append({"src": "slides/" + out, "cut": cut})
        print("wrote slide", out, "extra cut:", cut or "-")
    with open(os.path.join(OUT, "slides.json"), "w") as fh:
        json.dump(slides, fh, indent=2)

    # stickers + special-move FX: trimmed, not squared
    os.makedirs(os.path.join(OUT, "stickers"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "fx"), exist_ok=True)
    stickers = {"win": [], "lose": []}
    for f in names:
        m, fx = STICKER_RE.match(f), FX_RE.match(f)
        if not (m or fx):
            continue
        im = key_white(Image.open(os.path.join(SRC, f)))
        im = im.crop(im.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox())
        im.thumbnail((FX_MAX, FX_MAX), Image.LANCZOS)
        name = os.path.splitext(f)[0].lower() + ".png"
        folder = "stickers" if m else "fx"
        im.save(os.path.join(OUT, folder, name), optimize=True)
        if m:
            stickers[m.group(1).lower()].append(folder + "/" + name)
        print("wrote", folder + "/" + name)
    with open(os.path.join(OUT, "stickers.json"), "w") as fh:
        json.dump(stickers, fh, indent=2)

    # everything else is square art: the bubble characters, plus UI icons like
    # hamstar (the level rating star), which the game loads by name
    for f in names:
        if SLIDE_RE.match(f) or STICKER_RE.match(f) or FX_RE.match(f):
            continue
        out = square(key_white(Image.open(os.path.join(SRC, f))))
        dst = os.path.join(OUT, os.path.splitext(f)[0].replace("_bubble", "") + ".png")
        out.save(dst, optimize=True)
        print("wrote", os.path.relpath(dst))


if __name__ == "__main__":
    main()
