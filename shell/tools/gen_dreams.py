#!/usr/bin/env python3
"""Builds Dream Things for SHELL: every Yumemono (Ethereum, 0x7011…3335), 1-5200.

  python3 tools/gen_dreams.py [--skip-images]

Metadata comes from the collection's own server (metadata.yumemono.com, the
contract's tokenURI) and is cached in tools/cache/yumemono/. Writes
root/YOLK/dreams/: data.txt (fixed-size records, rarest traits first),
img/<(n-1)/500>/<n>.bmp (138x184), splash/title/fallback art.
"""
import io
import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "root" / "YOLK" / "dreams"
CACHE = HERE / "cache" / "yumemono"
META = "https://metadata.yumemono.com/json/{}"

sys.path.insert(0, str(HERE))
from gen_art import title, PINK  # noqa: E402

N = 5200
PIC_W, PIC_H = 138, 184          # Yumemono art is 3:4 portrait
PER_DIR = 500

NIGHT = (27, 22, 64)
LAVENDER = (176, 160, 230)
PINKY = (255, 179, 217)
CLOUD = (250, 244, 255)


def fetch(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SHELL-DreamThings/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception:
            time.sleep(1 + i * 2)
    raise RuntimeError("couldn't fetch " + url)


def meta(n):
    f = CACHE / "json" / f"{n}.json"
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(fetch(META.format(n)))
    return json.loads(f.read_text())


def ascii_safe(s):
    s = str(s).replace("☆", "*")
    return "".join(c if ord(c) < 256 else "?" for c in s).replace("|", "/").replace("~", "-")


def tier(rank):
    f = rank / N
    return "MYTHIC" if f <= .01 else "LEGENDARY" if f <= .05 else "EPIC" if f <= .15 else "RARE" if f <= .4 else "COMMON"


def pct(count):
    p = count / N * 100
    return f"{p:.2f}%" if p < 1 else f"{p:.1f}%"


def records(metas):
    # tokens with no traits are the animated ones; give them a trait so they count
    traits = {}
    for n, m in metas.items():
        attrs = [(a["trait_type"], str(a["value"])) for a in m.get("attributes", [])]
        if not attrs:
            attrs = [("Type", "Animated")]
        traits[n] = dict(attrs)
    types = sorted({t for d in traits.values() for t in d})
    counts = {t: {} for t in types}
    for d in traits.values():
        for t in types:
            v = d.get(t, None)
            counts[t][v] = counts[t].get(v, 0) + 1
    # rarity: sum of N/count over every trait type, counting "doesn't have it" too
    score = {n: sum(N / counts[t][d.get(t)] for t in types) for n, d in traits.items()}
    order = sorted(score, key=lambda n: -score[n])
    rank = {n: i + 1 for i, n in enumerate(order)}
    recs = []
    for n in range(1, N + 1):
        d = traits[n]
        shown = sorted(((counts[t][v], t, v) for t, v in d.items()), key=lambda x: x[0])
        recs.append("|".join([str(rank[n]), tier(rank[n])] +
                             [f"{ascii_safe(t).lower()}~{ascii_safe(v).lower()}~{pct(c)}" for c, t, v in shown]))
    L = max(len(r) for r in recs) + 1
    with open(OUT / "data.txt", "w", encoding="latin-1", newline="") as f:
        for r in recs:
            f.write(r.ljust(L - 1) + "\n")
    (OUT / "reclen.txt").write_text(str(L))
    print(f"data.txt: {len(recs)} records of {L} bytes, {len(types)} trait types; rarest is #{order[0]}")


def picture(n, m):
    out = OUT / "img" / str((n - 1) // PER_DIR) / f"{n}.bmp"
    if out.exists():
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(io.BytesIO(fetch(m["image"])))
    im.seek(0)                                   # first frame of the animated ones
    im = im.convert("RGBA")
    bg = Image.new("RGBA", im.size, NIGHT + (255,))
    bg.alpha_composite(im)
    # fill the 3:4 frame (crop a little if the art isn't exactly 3:4)
    scale = max(PIC_W / im.width, PIC_H / im.height)
    small = bg.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    x, y = (small.width - PIC_W) // 2, (small.height - PIC_H) // 2
    small.crop((x, y, x + PIC_W, y + PIC_H)).convert("RGB").save(out, "BMP")


def cloud(d, x, y, s, color):
    for dx, dy, r in [(0, 0, 1.0), (0.9, -0.35, 0.8), (1.7, 0, 0.9), (0.85, 0.25, 0.9)]:
        rr = int(r * s)
        d.ellipse([x + dx * s - rr, y + dy * s - rr, x + dx * s + rr, y + dy * s + rr], fill=color)


def splash(featured):
    W, H = 320, 240
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    top, mid, low = NIGHT, (92, 74, 170), PINKY
    for y in range(H):
        t = y / H
        a, b, k = (top, mid, t / 0.55) if t < 0.55 else (mid, low, (t - 0.55) / 0.45)
        d.line([(0, y), (W, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3)))
    import random
    rnd = random.Random(7)
    for _ in range(70):                               # stars
        x, y = rnd.randrange(W), rnd.randrange(int(H * 0.55))
        c = rnd.choice([CLOUD, PINKY, LAVENDER])
        d.point((x, y), fill=c)
        if rnd.random() < 0.15:
            d.point((x + 1, y), fill=c); d.point((x - 1, y), fill=c); d.point((x, y + 1), fill=c); d.point((x, y - 1), fill=c)
    for x, y, s in [(10, 205, 22), (220, 212, 26), (120, 226, 20)]:     # clouds along the bottom
        cloud(d, x, y, s, CLOUD)
    if featured:
        f = featured.resize((96, 128), Image.LANCZOS)
        d.rectangle([W // 2 - 50, 26, W // 2 + 49, 157], fill=CLOUD)
        img.paste(f, (W // 2 - 48, 28))
    t = title("DREAM THINGS", 32, CLOUD)
    mask = Image.new("L", t.size, 0)
    tp, mp = t.load(), mask.load()
    for yy in range(t.height):
        for xx in range(t.width):
            mp[xx, yy] = 0 if tp[xx, yy] == PINK else 255
    tx, ty = (W - t.width) // 2, 164
    shadow = Image.new("RGB", t.size, (92, 74, 170))
    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2), (2, 2)]:
        img.paste(shadow, (tx + dx, ty + dy), mask)
    img.paste(t, (tx, ty), mask)
    return img


def fallback():
    img = Image.new("RGB", (64, 40), PINK)
    cloud(ImageDraw.Draw(img), 14, 24, 12, CLOUD)
    return img


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(6) as ex:
        metas = dict(zip(range(1, N + 1), ex.map(meta, range(1, N + 1))))
    print("metadata ok")
    records(metas)
    feat = None
    try:
        im = Image.open(io.BytesIO(fetch(metas[1]["image"]))).convert("RGBA")
        feat = Image.new("RGBA", im.size, NIGHT + (255,)); feat.alpha_composite(im); feat = feat.convert("RGB")
    except Exception:
        pass
    splash(feat).save(OUT / "splash.bmp", "BMP")
    title("DREAM THINGS", 24, PINKY).save(OUT / "title.bmp", "BMP")
    fallback().save(OUT / "fallback.bmp", "BMP")
    if "--skip-images" not in sys.argv:
        done = 0
        with ThreadPoolExecutor(6) as ex:
            for _ in ex.map(lambda n: picture(n, metas[n]), range(1, N + 1)):
                done += 1
                if done % 500 == 0:
                    print(f"pictures: {done}/{N}", flush=True)
        print("pictures ok")
