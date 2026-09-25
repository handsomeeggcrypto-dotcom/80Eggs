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

Files named <kind>_slide_<n> (kind = good / bad / random) are SLIDES, not bubbles:
characters cropped flat along the bottom edge so they can "peek" in from a screen
edge. They're trimmed (keeping that flat bottom), capped at SLIDE_MAX px, written to
assets/slides/, and listed in assets/slides.json for the game to load.

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
SLIDE_RE = re.compile(r"^(good|bad|random)_slide_", re.I)
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


def build_slide(src, dst):
    im = key_white(Image.open(src))
    box = im.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
    # keep the flat cut edge: extend the crop down to the source's bottom
    im = im.crop((box[0], box[1], box[2], im.height))
    im.thumbnail((SLIDE_MAX, SLIDE_MAX), Image.LANCZOS)
    im.save(dst, optimize=True)


def main():
    os.makedirs(os.path.join(OUT, "slides"), exist_ok=True)
    names = sorted(f for f in os.listdir(SRC) if f.lower().endswith((".jpeg", ".jpg", ".png")))
    slides = {"good": [], "bad": [], "random": []}
    for f in names:
        m = SLIDE_RE.match(f)
        if not m:
            continue
        out = os.path.splitext(f)[0].lower() + ".png"
        build_slide(os.path.join(SRC, f), os.path.join(OUT, "slides", out))
        slides[m.group(1).lower()].append("slides/" + out)
        print("wrote slide", out)
    with open(os.path.join(OUT, "slides.json"), "w") as fh:
        json.dump(slides, fh, indent=2)

    for f in names:
        if SLIDE_RE.match(f):
            continue
        out = square(key_white(Image.open(os.path.join(SRC, f))))
        dst = os.path.join(OUT, os.path.splitext(f)[0].replace("_bubble", "") + ".png")
        out.save(dst, optimize=True)
        print("wrote", os.path.relpath(dst))


if __name__ == "__main__":
    main()
