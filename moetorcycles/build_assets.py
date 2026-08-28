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
from PIL import Image, ImageDraw

SRC = os.path.expanduser("~/Desktop/moetorcycle")
OUT = os.path.join(os.path.dirname(__file__), "assets")
os.makedirs(OUT, exist_ok=True)


def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def content_bbox(im, thresh=25):
    alpha = im.split()[3].point(lambda p: 255 if p > thresh else 0)
    return alpha.getbbox()


def remove_white_bg(im, thresh=34):
    """Some AI frames come on a solid WHITE background. Flood-fill from the
    border (not a global key) so white *on* the bike/rider is preserved, and
    make the surrounding white transparent. Frames already transparent at the
    border are left untouched (no near-white seeds fire)."""
    im = im.convert("RGBA")
    w, h = im.size
    rgb = im.convert("RGB")
    SENT = (255, 0, 255)  # sentinel colour not present in the art
    px = rgb.load()
    def whiteish(p): return p[0] > 225 and p[1] > 225 and p[2] > 225
    seeds = []
    for xx in range(0, w, 16): seeds += [(xx, 0), (xx, h - 1)]
    for yy in range(0, h, 16): seeds += [(0, yy), (w - 1, yy)]
    for s in seeds:
        if px[s] != SENT and whiteish(px[s]):
            ImageDraw.floodfill(rgb, s, SENT, thresh=thresh)
    # keep each pixel's original alpha; only zero out the keyed (sentinel) bg
    orig = list(im.split()[3].getdata())
    rd = list(rgb.getdata())
    alpha = Image.new("L", (w, h))
    alpha.putdata([0 if rd[i] == SENT else orig[i] for i in range(len(rd))])
    im.putalpha(alpha)
    return im


def save(im, name):
    im.save(os.path.join(OUT, name))
    print(f"  {name:26s} {im.size}")


def build_ride(prefix, poses, pad=8, preprocess=None):
    """Shared-crop: when every pose shares one canvas at a consistent scale,
    crop them all to the union bbox so the bike stays registered. (Crayons.)
    `preprocess` (e.g. remove_white_bg) runs on each frame first."""
    imgs = {k: (preprocess(load(f)) if preprocess else load(f)) for k, f in poses.items()}
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


def build_ride_aligned(prefix, poses, pad=14, thresh=45, preprocess=None):
    """Trim + bottom-center align: when poses come on DIFFERENT canvas sizes
    (mismatched framing) but the bike is drawn at a consistent pixel scale,
    trim each to content and drop them onto one common canvas, bottom-aligned so
    the tyres share a baseline and horizontally centred. (Eggs, ABBA.)
    `preprocess` (e.g. remove_white_bg) runs on each frame first."""
    trimmed = {}
    for k, f in poses.items():
        im = load(f)
        if preprocess:
            im = preprocess(im)
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

# ===========================================================================
#  RIDE: Bradley  (frames span TWO canvas sizes — wheelie_01 & crash_02 are
#  1536x1024, the rest 1254x1254 — so use the trim+align mode, not shared-crop,
#  or the wider frames get their bike front clipped)
# ===========================================================================
build_ride_aligned("bradley", {
    "ride":    "bradley_idle_01.png",
    "wheelie": "bradley_wheelie_01.png",
    "air":     "bradley_airborne_02.png",
    "land":    "bradley_landing_01.png",
    "crash":   "bradley_crash_02.png",
})

# ===========================================================================
#  RIDE: ABBA  (mixed canvas sizes -> aligned mode; all frames now transparent)
# ===========================================================================
build_ride_aligned("abba", {
    "ride":    "abba_idle_01.png",
    "wheelie": "abba_wheelie_01.png",
    "air":     "abba_airborne_01.png",
    "land":    "abba_landing_01.png",
    "crash":   "abba_crash_01.png",
})

# ---- MOE Zedong Dustoff (shield rescue helicopter) ----
heli = load("skill_dustoff.png")
save(heli.crop(content_bbox(heli, 30)), "dustoff.png")

print("Done. Assets in", OUT)
