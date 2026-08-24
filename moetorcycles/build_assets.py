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
    """poses: {pose_key: source_filename}. Cbrop all to a shared bbox."""
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

print("Done. Assets in", OUT)
