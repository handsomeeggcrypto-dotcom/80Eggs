#!/usr/bin/env python3
"""Makes the meditation sounds: binaural beats (Hemi-Sync style) and noise.

  python3 yolk/tools/make_meditation_audio.py

Writes 30-minute AAC tracks to yolk/static/sounds/med/ (git-ignored, ~120MB):
the tablet streams them during meditation, and SHELL gets them as a
"Meditation" album. Binaural beats only work in stereo headphones: each ear
hears a slightly different tone and the brain perceives the difference as a
slow beat. A quiet pink-noise bed sits under them so they're easier to sit with.

Each sound is computed once as a seamless 60-second loop (every tone does a
whole number of cycles in 60s; noise loops are crossfaded at the seam), then
repeated to 30 minutes with a gentle fade in and out.
"""
import math
import random
import struct
import subprocess
import tempfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "sounds" / "med"
RATE = 44100
LOOP = 60            # seconds
MINUTES = 30
FADE = 10            # seconds of fade in / out

TRACKS = [
    # file name,                    title,                                    left Hz, right Hz, noise
    ("01 Theta 6Hz binaural.m4a",   "Theta 6 Hz binaural (deep meditation)",  200, 206, "pink"),
    ("02 Alpha 10Hz binaural.m4a",  "Alpha 10 Hz binaural (calm focus)",      200, 210, "pink"),
    ("03 Delta 3Hz binaural.m4a",   "Delta 3 Hz binaural (sleep)",            150, 153, "pink"),
    ("04 White noise.m4a",          "White noise",                            None, None, "white"),
    ("05 Pink noise.m4a",           "Pink noise",                             None, None, "pink"),
    ("06 Brown noise.m4a",          "Brown noise",                            None, None, "brown"),
]


def noise(kind, n, seed):
    rnd = random.Random(seed)
    out = [0.0] * n
    if kind == "white":
        for i in range(n):
            out[i] = rnd.uniform(-1, 1) * 0.5
    elif kind == "pink":                                   # Paul Kellet's filter
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0
        for i in range(n):
            w = rnd.uniform(-1, 1)
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759
            b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856
            b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980
            out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
            b6 = w * 0.115926
    else:                                                  # brown: leaky integration
        v = 0.0
        for i in range(n):
            v = (v + rnd.uniform(-1, 1) * 0.02) * 0.998
            out[i] = v * 3.5
    # crossfade the last second into the first, so the loop has no seam
    x = RATE
    for i in range(x):
        k = i / x
        out[i] = out[i] * k + out[n - x + i] * (1 - k)
    return out


def loop_frames(left_hz, right_hz, kind):
    """60s of 16-bit stereo, as a list of (L, R) floats."""
    n = RATE * LOOP
    bed = noise(kind, n + RATE, seed=hash(kind) & 0xffff)[:n]
    if left_hz is None:
        return [(s, s) for s in bed]                       # noise is the same in both ears
    level, bed_level = 0.22, 0.25
    tl, tr = 2 * math.pi * left_hz / RATE, 2 * math.pi * right_hz / RATE
    return [(math.sin(tl * i) * level + bed[i] * bed_level, math.sin(tr * i) * level + bed[i] * bed_level)
            for i in range(n)]


def pack(frames, gain=lambda i: 1.0, start=0):
    b = bytearray()
    for i, (l, r) in enumerate(frames):
        g = gain(start + i)
        b += struct.pack("<hh", int(max(-1, min(1, l * g)) * 32767), int(max(-1, min(1, r * g)) * 32767))
    return bytes(b)


def build(name, title, left, right, kind):
    out = OUT / name
    if out.exists():
        print("have", name)
        return
    print("making", name)
    frames = loop_frames(left, right, kind)
    total = RATE * 60 * MINUTES
    fade = RATE * FADE
    loops = total // len(frames)
    middle = pack(frames)                                  # the plain loop, reused
    first = pack(frames, lambda i: min(1.0, i / fade))     # fades in
    last_start = (loops - 1) * len(frames)
    last = pack(frames, lambda i: min(1.0, (total - i) / fade), start=last_start)   # fades out
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "t.wav"
        data_len = len(middle) * loops
        with open(wav, "wb") as f:
            f.write(b"RIFF" + struct.pack("<I", 36 + data_len) + b"WAVE")
            f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, RATE, RATE * 4, 4, 16))
            f.write(b"data" + struct.pack("<I", data_len))
            f.write(first)
            for _ in range(loops - 2):
                f.write(middle)
            f.write(last)
        bitrate = "128000" if left else "96000"
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", bitrate, str(wav), str(out)], check=True)
    print("  ->", out.name, f"{out.stat().st_size / 1e6:.0f} MB")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for t in TRACKS:
        build(*t)
