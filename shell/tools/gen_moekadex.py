#!/usr/bin/env python3
"""Builds the Moekadex app's data for SHELL: trait records, Moe pictures, Bradley splash.

  python3 tools/gen_moekadex.py [--skip-images]

Reads ~/80Eggs/moekedex/data.js (traits) and ~/80Eggs/moekedex/ipod_photos (pictures),
writes into root/YOLK/moekadex/.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "root" / "YOLK" / "moekadex"
MOEKEDEX = Path.home() / "80Eggs" / "moekedex"
BRADLEY = HERE / "art" / "bradley.jpg"

sys.path.insert(0, str(HERE))
from gen_art import title, PINK  # noqa: E402

BLUE = (4, 86, 250)        # Bradley's background
NAVY = (6, 18, 74)
YELLOW = (255, 194, 26)
BROWN = (106, 62, 0)       # Bradley's outline
WHITE = (242, 234, 219)

N = 5250
IMG_W, IMG_H = 160, 176    # same shape as the 1000x1100 originals
PER_DIR = 500              # keep folders small; FAT32 is slow with huge ones


def tier(rank):
    f = rank / N
    return "MYTHIC" if f <= .01 else "LEGENDARY" if f <= .05 else "EPIC" if f <= .15 else "RARE" if f <= .4 else "COMMON"


def ascii_safe(s):
    # the theme font is Latin-1 only
    s = s.replace("✰", "*")
    return "".join(c if ord(c) < 256 else "?" for c in s).replace("|", "/").replace("~", "-")


def pct(count):
    p = count / N * 100
    return f"{p:.2f}%" if p < 1 else f"{p:.1f}%"


def records():
    s = (MOEKEDEX / "data.js").read_text()
    D = json.loads(s[s.index("{"):s.rindex("}") + 1])
    recs = []
    for i, flat in enumerate(D["tokens"]):
        traits = []
        for t, v in zip(flat[0::2], flat[1::2]):
            c = D["counts"][t][v]
            traits.append((c, ascii_safe(D["types"][t]), ascii_safe(D["values"][t][v]), pct(c)))
        traits.sort()  # rarest first
        rank = D["rank"][i]
        recs.append("|".join([str(rank), tier(rank)] + [f"{t}~{v}~{p}" for _, t, v, p in traits]))
    # fixed-size records so the app can seek straight to Moe n
    L = max(len(r) for r in recs) + 1
    with open(OUT / "data.txt", "w", encoding="latin-1", newline="") as f:
        for r in recs:
            f.write(r.ljust(L - 1) + "\n")
    (OUT / "reclen.txt").write_text(str(L))
    print(f"data.txt: {len(recs)} records of {L} bytes")


def key_blue(img):
    """Bradley's blue background -> Rockbox's transparent magenta."""
    img = img.convert("RGB")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b = px[x, y]
            if b > 150 and b > r + 70 and b > g + 40:
                px[x, y] = PINK
    return img


def bradley(size):
    im = Image.open(BRADLEY).convert("RGB").crop((150, 160, 760, 700))
    w = size
    h = round(size * im.height / im.width)
    return key_blue(im.resize((w, h), Image.LANCZOS))


def splash():
    b = bradley(150)
    # paste with transparency: a mask from the non-magenta pixels
    mask = Image.new("L", b.size, 0)
    mp, bp = mask.load(), b.load()
    for y in range(b.height):
        for x in range(b.width):
            mp[x, y] = 0 if bp[x, y] == PINK else 255
    img = Image.new("RGB", (320, 240), BLUE)
    img.paste(b, ((320 - b.width) // 2, 14), mask)
    # title with a brown outline, like Bradley's
    t = title("MOEKADEX", 32, YELLOW)
    tm = Image.new("L", t.size, 0)
    tp, tmp_ = t.load(), tm.load()
    for y in range(t.height):
        for x in range(t.width):
            tmp_[x, y] = 0 if tp[x, y] == PINK else 255
    tx, ty = (320 - t.width) // 2, 168
    outline = Image.new("RGB", t.size, BROWN)
    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2), (-2, 2), (2, -2)]:
        img.paste(outline, (tx + dx, ty + dy), tm)
    img.paste(t, (tx, ty), tm)
    return img


def pictures():
    src = MOEKEDEX / "ipod_photos"
    done = 0
    for n in range(1, N + 1):
        lo = (n - 1) // 250 * 250 + 1
        jpg = src / f"Moes {lo:04d}-{min(lo + 249, N):04d}" / f"Moe {n:04d}.jpg"
        d = OUT / "img" / str((n - 1) // PER_DIR)
        d.mkdir(parents=True, exist_ok=True)
        out = d / f"{n}.bmp"
        if out.exists():
            continue
        Image.open(jpg).convert("RGB").resize((IMG_W, IMG_H), Image.LANCZOS).save(out, "BMP")
        done += 1
    print(f"pictures: {done} converted")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    records()
    splash().save(OUT / "splash.bmp", "BMP")
    bradley(64).save(OUT / "bradley.bmp", "BMP")
    title("MOEKADEX", 24, YELLOW).save(OUT / "title.bmp", "BMP")
    if "--skip-images" not in sys.argv:
        pictures()
