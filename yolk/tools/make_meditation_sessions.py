#!/usr/bin/env python3
"""Makes SHELL's ready-to-play meditation sessions: bell, sound, bell.

  python3 yolk/tools/make_meditation_sessions.py

SHELL can't play sounds while a YOLK app is open (the app takes the music
player's memory), so MEDITATE just queues one of these and lets the music
player do the rest. Each track is one whole session:

  bell -> the sound, fading in -> exactly N minutes -> two bells -> the end

for 5/10/15/20/30 minutes x silence, theta/alpha/delta binaural, white/pink/
brown noise (35 tracks, ~440MB). Written to yolk/static/sounds/sessions/
(git-ignored); daily.deliver_meditation() copies them to SHELL's
Music/Meditation Sessions/, which is how the now-playing screen knows to show
breathing YOLK. Names are "<MM> min <sound>.m4a"; meditate.lua builds the same.
"""
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_meditation_audio import RATE, LOOP, loop_frames   # noqa: E402

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "static" / "sounds" / "sessions"
BELL = HERE / "static" / "sounds" / "bell.wav"
LENGTHS = [5, 10, 15, 20, 30]
SOUNDS = [
    # name (as in meditate.lua), left Hz, right Hz, noise, AAC bitrate
    ("silence",     None, None, None,    64000),
    ("theta",       200,  206,  "pink",  128000),
    ("alpha",       200,  210,  "pink",  128000),
    ("delta",       150,  153,  "pink",  128000),
    ("white noise", None, None, "white", 96000),
    ("pink noise",  None, None, "pink",  96000),
    ("brown noise", None, None, "brown", 96000),
]
FADE_IN_AT, FADE = 2, 10       # the sound starts under the bell and fades in over 10s
CLOSING = [0, 3]               # closing bells (seconds after the N minutes are up)
TAIL = 9                       # seconds of track after the N minutes


def bell():
    """bell.wav (22kHz mono) as 44.1kHz floats."""
    w = wave.open(str(BELL))
    n, rate = w.getnframes(), w.getframerate()
    raw = struct.unpack("<%dh" % n, w.readframes(n))
    step = rate / RATE
    out = []
    for i in range(int(n / step)):
        p = i * step
        j = int(p)
        k = p - j
        a = raw[j]; b = raw[min(j + 1, n - 1)]
        out.append((a + (b - a) * k) / 32768)
    return out


def pack(pairs):
    return b"".join(struct.pack("<hh", int(max(-1, min(1, l)) * 32767), int(max(-1, min(1, r)) * 32767))
                    for l, r in pairs)


def build(minutes, name, frames, middle, bitrate, ding):
    out = OUT / f"{minutes:02d} min {name}.m4a"
    if out.exists():
        print("have", out.name)
        return
    n = len(frames)
    end = RATE * 60 * minutes

    def sound(i, gain):
        l, r = frames[i % n]
        return l * gain, r * gain

    # opening: bell over the sound fading in
    a_len = RATE * (FADE_IN_AT + FADE)
    opening = []
    for i in range(a_len):
        g = min(1.0, max(0.0, (i - RATE * FADE_IN_AT) / (RATE * FADE)))
        l, r = sound(i, g)
        b = ding[i] if i < len(ding) else 0.0
        opening.append((l + b, r + b))
    # closing: the sound fades out right as the N minutes end, then the bells
    c_start = end - RATE * FADE
    closing = [sound(i, (end - i) / (RATE * FADE)) for i in range(c_start, end)]
    tail = [0.0] * (RATE * TAIL)
    for at in CLOSING:
        for j, b in enumerate(ding):
            if at * RATE + j < len(tail):
                tail[at * RATE + j] += b
    closing += [(b, b) for b in tail]

    print("making", out.name)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "t.wav"
        data_len = (end + RATE * TAIL) * 4
        with open(wav, "wb") as f:
            f.write(b"RIFF" + struct.pack("<I", 36 + data_len) + b"WAVE")
            f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, RATE, RATE * 4, 4, 16))
            f.write(b"data" + struct.pack("<I", data_len))
            f.write(pack(opening))
            i = a_len                                      # the plain loop, from wherever it's up to
            while i < c_start:
                k = i % n
                take = min(n - k, c_start - i)
                f.write(middle[k * 4:(k + take) * 4])
                i += take
            f.write(pack(closing))
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", str(bitrate), str(wav), str(out)], check=True)
    print("  ->", f"{out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    ding = bell()
    for name, left, right, kind, bitrate in SOUNDS:
        if all((OUT / f"{m:02d} min {name}.m4a").exists() for m in LENGTHS):
            print("have all", name)
            continue
        frames = [(0.0, 0.0)] * (RATE * LOOP) if kind is None else loop_frames(left, right, kind)
        middle = pack(frames)
        for m in LENGTHS:
            build(m, name, frames, middle, bitrate, ding)
    total = sum(p.stat().st_size for p in OUT.glob("*.m4a"))
    print(f"{len(list(OUT.glob('*.m4a')))} sessions, {total / 1e6:.0f} MB in {OUT}")
