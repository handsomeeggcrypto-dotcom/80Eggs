#!/usr/bin/env python3
"""Rebuilds YOLK's web faces and the meditation bell.

  python3 yolk/tools/make_assets.py

faces/<mood>.png      24px, for pages that scale them up with crisp pixels
faces/big/<mood>.png  240px, already blown up 10x: the tablet's 2015-era
                      Chrome blurs scaled images (no image-rendering: pixelated)
sounds/bell.wav       a soft singing-bowl tone for meditation
"""
import math
import struct
import sys
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATIC = HERE.parent / "static"
sys.path.insert(0, str(Path.home() / "80Eggs" / "shell" / "tools"))
from gen_art import yolk_face, PINK  # noqa: E402

MOODS = ["great", "good", "ok", "tired", "dying", "dream", "blink", "talk", "sus", "love", "shock",
         "lookl", "lookr", "lookup"]


def transparent(img):
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][:3] == PINK:
                px[x, y] = (0, 0, 0, 0)
    return img


def faces():
    (STATIC / "faces" / "big").mkdir(parents=True, exist_ok=True)
    for m in MOODS:
        transparent(yolk_face(m, 1)).save(STATIC / "faces" / f"{m}.png")
        transparent(yolk_face(m, 10)).save(STATIC / "faces" / "big" / f"{m}.png")


def bell(seconds=6.0, rate=22050):
    """A struck bowl: a few inharmonic partials, each fading at its own pace."""
    partials = [(220.0, 1.0, 1.6), (440.0 * 1.01, 0.45, 2.4), (660.0 * 0.99, 0.25, 3.2), (1210.0, 0.12, 4.5)]
    n = int(seconds * rate)
    samples = []
    for i in range(n):
        t = i / rate
        attack = min(1.0, t / 0.01)
        v = sum(a * math.exp(-t * d) * math.sin(2 * math.pi * f * t) for f, a, d in partials)
        v *= attack * 0.32 * (1 + 0.03 * math.sin(2 * math.pi * 4.5 * t))   # gentle shimmer
        samples.append(max(-1.0, min(1.0, v)))
    (STATIC / "sounds").mkdir(parents=True, exist_ok=True)
    with wave.open(str(STATIC / "sounds" / "bell.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(s * 32767)) for s in samples))


if __name__ == "__main__":
    faces()
    bell()
    print("faces + bell written to", STATIC)
