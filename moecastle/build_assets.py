#!/usr/bin/python3
"""Defend Your LLC art: pulls the Moe Fights fighters and arenas out of the game file into assets/.

Source is ~/Desktop/MoeFights_beta.html (the Moe Fights master copy). Re-run after new fighters land.
"""
import base64, io, json, os, re, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.expanduser("~/Desktop/MoeFights_beta.html")
OUT = os.path.join(HERE, "assets")
FRAMES = ["walk_01", "walk_02", "walk_03", "hit_01", "koed_01", "punch_02", "idle_01", "win_01"]
SPRITE_H = 260   # drawn at most ~200px tall
ARENA_W = 1280
ARENA_PICKS = {7, 13, 12, 9, 14, 15, 3, 23, 19, 10, 11, 25}  # keep in step with ARENA_ORDER in game.js

HQ_SRC = os.path.expanduser("~/Desktop/moecastle/MoemoeLLC Cyberpunk Headquarters.png")
HQ_ROOF = 665        # source pixels: the roof deck. Above it, white pockets (railing, tower) are see-through
HQ_FLAG = (800, 120, 1015, 290)   # ...except on the flag, whose eyes have white in them
HQ_W = 800

def build_hq():
    """The HQ picture: white background keyed out, shrunk to about twice its size on screen."""
    im = Image.open(HQ_SRC).convert("RGBA")
    w, h = im.size
    px = im.load()
    white = lambda p: min(p[0], p[1], p[2]) > 222
    gone = bytearray(w * h)
    def fill(sx, sy):
        stack = [(sx, sy)]
        while stack:
            x, y = stack.pop()
            if x < 0 or y < 0 or x >= w or y >= h or gone[y * w + x] or not white(px[x, y]):
                continue
            gone[y * w + x] = 1
            stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    for x in range(w):
        fill(x, 0)
        fill(x, h - 1)
    for y in range(h):
        fill(0, y)
        fill(w - 1, y)
    fx0, fy0, fx1, fy1 = HQ_FLAG
    for y in range(HQ_ROOF):
        for x in range(w):
            if not (fx0 <= x < fx1 and fy0 <= y < fy1):
                fill(x, y)
    for y in range(h):
        for x in range(w):
            if gone[y * w + x]:
                px[x, y] = (0, 0, 0, 0)
    im = im.resize((HQ_W, int(h * HQ_W / float(w))), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    im.save(os.path.join(OUT, "hq.webp"), "WEBP", quality=88, method=4)
    print("hq", im.size)

build_hq()
if "hq" in sys.argv:   # just the HQ: ./build_assets.py hq
    sys.exit()

html = open(SRC, encoding="utf-8").read()

def decode(b64):
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")

# fighters: the CHAR_SPRITES table, then later CHAR_SPRITES.x.y = "..." lines
start = html.index("const CHAR_SPRITES = {")
end = html.index("const ARENAS", start)
table = html[start:end]
sprites = {}
cur = None
for m in re.finditer(r'''(\w+):\s*\{\s*(?=")|"(\w+)":\s*"data:image/\w+;base64,([^"]+)"''', table):
    if m.group(1):
        cur = m.group(1)
        sprites.setdefault(cur, {})
    elif cur:
        sprites[cur][m.group(2)] = m.group(3)
for m in re.finditer(r'''CHAR_SPRITES\.(\w+)\.(\w+)\s*=\s*"data:image/\w+;base64,([^"]+)"''', html):
    sprites.setdefault(m.group(1), {})[m.group(2)] = m.group(3)

os.makedirs(os.path.join(OUT, "sprites"), exist_ok=True)
manifest = {}
for char, frames in sorted(sprites.items()):
    if "hit_01" not in frames or "walk_01" not in frames:
        continue
    manifest[char] = []
    # one scale per fighter, set by the walk pose, so a flat koed frame stays the right size
    walk = decode(frames["walk_01"])
    k = min(1.0, SPRITE_H / float(walk.crop(walk.getbbox()).height))
    for name in FRAMES:
        if name not in frames:
            continue
        im = decode(frames[name])
        box = im.getbbox()
        if box:
            im = im.crop(box)
        im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
        im.save(os.path.join(OUT, "sprites", "%s_%s.webp" % (char, name)), "WEBP", quality=82, method=4)
        manifest[char].append([name, im.width, im.height])

# arenas: the backdrops
os.makedirs(os.path.join(OUT, "arenas"), exist_ok=True)
arenas = re.findall(r'"(arena\d+)":\s*"data:image/\w+;base64,([^"]+)"', html)
arenas += re.findall(r'ARENAS\.(arena\d+)\s*=\s*"data:image/\w+;base64,([^"]+)"', html)
for name, b64 in arenas:
    if int(name[5:]) not in ARENA_PICKS:
        continue
    im = decode(b64).convert("RGB")
    im.thumbnail((ARENA_W, ARENA_W), Image.LANCZOS)
    im.save(os.path.join(OUT, "arenas", name + ".webp"), "WEBP", quality=72, method=4)

with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f)
print(len(manifest), "fighters,", len(arenas), "arenas")
