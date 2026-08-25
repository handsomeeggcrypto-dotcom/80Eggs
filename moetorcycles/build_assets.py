#!/usr/bin/env python3
"""
MOEtorcycles asset pipeline.

A RIDE is one character-already-on-a-bike combo, drawn as single frames (one PNG
per pose). The source art is generated with the character already on the bike, so
there's no compositing to do -- we just crop the frames.

IMPORTANT: all poses of a ride are cropped to ONE shared bounding box (the union
of every pose's content box), not trimmed individually. Because the source frames
share a canvas and draw the bike at a consistent scale/position, a shared crop
keeps the bike aligned across poses so it doesn't hop when the pose changes.

Re-run any time the source art changes.
"""
import os
from PIL import Image

SRC = os.path.expanduser("~/Desktop/moetorcycle")
OUT = os.path.join(os.path.dirname(__file__), "assets")
os.makedirs(OUT, exist_ok=True)


def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def content_bbox(im, thresh=25):
    alpha = im.split()[3].point(lambda p: 255 if p > thresh else 0)
    return alpha.getbbox()


def save(im, name):
    im.save(os.path.join(OUT, name))
    print(f"  {name:26s} {im.size}")


def build_ride(prefix, poses, pad=8):
    """Shared-crop: when every pose shares one canvas at a consistent scale,
    crop them all to the union bbox so the bike stays registered. (Crayons.)"""
    imgs = {k: load(f) for k, f in poses.items()}
    boxes = [content_bbox(im) for im in imgs.values()]
    l = min(b[0] for b in boxes) - pad
    t = min(b[1] for b in boxes) - pad
    r = max(b[2] for b in boxes) + pad
    b = max(b[3] for b in boxes) + pad
    w0, h0 = next(iter(imgs.values())).size
    box = (max(0, l), max(0, t), min(w0, r), min(h0, b))
    print(f"Ride '{prefix}': shared crop {box} -> {(box[2]-box[0], box[3]-box[1])}")
    for key, im in imgs.items():
        save(im.crop(box), f"player_{prefix}_{key}.png")


def build_ride_aligned(prefix, poses, pad=14, thresh=45):
    """Trim + bottom-center align: when poses come on DIFFERENT canvas sizes
    (mismatched framing) but the bike is drawn at a consistent pixel scale,
    trim each to content and drop them onto one common canvas, bottom-aligned so
    the tyres share a baseline and horizontally centred. (Eggs.)"""
    trimmed = {}
    for k, f in poses.items():
        im = load(f)
        bb = content_bbox(im, thresh)
        trimmed[k] = im.crop(bb)
    W = max(t.width for t in trimmed.values()) + pad * 2
    H = max(t.height for t in trimmed.values()) + pad * 2
    print(f"Ride '{prefix}': aligned canvas {(W, H)}  wheelFrac~{round((H - pad) / H, 3)}")
    for key, t in trimmed.items():
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        x = (W - t.width) // 2          # centre horizontally
        y = H - pad - t.height          # bottom-align content (tyres share a line)
        canvas.alpha_composite(t, (x, y))
        save(canvas, f"player_{prefix}_{key}.png")


# ===========================================================================
#  RIDE: Crayons  (single-frame character-on-bike art)
# ===========================================================================
# NOTE: idle_01 and idle_02 are separate drawings at different bike scale/position
# (not a matched 2-frame loop), so we use a single cruise frame + a subtle bob in
# game.js rather than alternating them. Regenerate the "ride2" line only if a
# properly-registered second idle frame is produced.
build_ride("crayons", {
    "ride":    "crayons_idle_01.png",
    "wheelie": "crayons_wheelie_01.png",
    "air":     "crayons_ariborne_01.png",   # (source filename has a typo)
    "land":    "crayons_landing_01.png",
    "crash":   "crayons_crash_01.png",
})

# ===========================================================================
#  RIDE: Eggs  (idle frames are a different canvas size than the action poses,
#  so use the trim + bottom-center alignment mode)
# ===========================================================================
build_ride_aligned("eggs", {
    "ride":    "eggs_idle_01.png",
    "wheelie": "eggs_wheelie_01.png",
    "air":     "eggs_airborne_01.png",
    "land":    "eggs_landing_01.png",
    "crash":   "eggs_crash_01.png",
})

print("Done. Assets in", OUT)
