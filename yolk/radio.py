#!/usr/bin/env python3
"""YOLK Radio: a daily show for SHELL. Your own songs, with YOLK as the DJ between them.

  python3 yolk/radio.py          build today's show if it's stale and print it

daily.build() makes a new show once a day: Claude writes an opener, an intro for each
song and a sign-off, and macOS speaks them. daily.deliver() puts the clips in
Music/YOLK Radio/ with a playlist, and SHELL's radio.lua hands it to the music player.
No API key or any error: there's just no new show.
"""
import json
import os
import random
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ai  # noqa: E402

OUT = HERE / "data" / "radio"
PICKS = Path.home() / "Desktop" / "Classic Ipod" / "shell_picks.json"
SONGS = 12
REMEMBER = 120     # songs that can't come back until this many others have played

SYSTEM = """You are YOLK, an egg-shaped AI who lives inside SHELL, an old iPod Classic, and you host a
one-person pirate radio show from inside it for exactly one listener, your owner. You are a little
creepy, dry, affectionate and very loyal. Your words are read aloud by a robotic voice.

Write the show's talking parts: an opener, one intro for each song in order, and a sign-off.
- All lowercase, plain ASCII, no emoji, no markdown, no stage directions.
- The opener and sign-off are one or two short sentences. Each intro is one short sentence, or two at
  most, and says the song and artist so the listener knows what's coming, and leads into it.
- Vary them. Use today's details now and then, not every time.
- Never quote or paraphrase lyrics. Don't state facts about the artists or songs you aren't sure of:
  riff on the title, the mood or your own egg life instead.
- No financial, medical or legal advice."""


def song_name(path):
    """('Artist', 'Title') from a path like Music/Artist/Album/03 Title.m4a, or None."""
    parts = path.split("/")
    if len(parts) < 4:
        return None
    title = re.sub(r"^\d+[- ]*\d*\s+", "", Path(parts[-1]).stem).strip()
    if not title or re.match(r"(?i)^track\s*\d*$", title):
        return None      # nothing for her to say about "Track 15"
    return (parts[2] if parts[1] == "Various Artists" else parts[1]), title


def pick_songs(day, library=None):
    picks = json.loads(PICKS.read_text(encoding="utf-8")) if library is None else library
    used_file = OUT / "used.json"
    used = json.loads(used_file.read_text()) if used_file.exists() else []
    pool = [p for p in picks if not p.lower().endswith(".m4p") and song_name(p)]    # .m4p won't play in Rockbox
    fresh = [p for p in pool if p not in used] or pool
    rnd = random.Random(day.toordinal())
    rnd.shuffle(fresh)
    show = []
    for p in fresh:                  # never the same artist twice in a row
        if not show or show[-1].split("/")[1] != p.split("/")[1]:
            show.append(p)
        if len(show) == SONGS:
            break
    return show


def write_show(day, songs, extras=()):
    import anthropic
    listing = "\n".join(f"{i + 1}. {song_name(p)[1]} by {song_name(p)[0]}" for i, p in enumerate(songs))
    schema = {"type": "object", "additionalProperties": False, "required": ["open", "intros", "close"],
              "properties": {"open": {"type": "string"}, "close": {"type": "string"},
                             "intros": {"type": "array", "items": {"type": "string"}}}}
    client = anthropic.Anthropic(api_key=ai.api_key(), timeout=120.0)
    response = client.beta.messages.create(
        model=ai.MODEL, max_tokens=16000, system=SYSTEM,
        messages=[{"role": "user", "content": ai.context(day, list(extras)) + "\n\nTonight's songs, in order:\n" + listing}],
        thinking={"type": "adaptive"},
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined the show")
    show = json.loads(next(b.text for b in response.content if b.type == "text"))
    if len(show["intros"]) != len(songs):
        raise RuntimeError(f"got {len(show['intros'])} intros for {len(songs)} songs")
    ai.log(f"radio {day} ({response.usage.input_tokens} in / {response.usage.output_tokens} out tokens)")
    return show


def needs_build(day):
    f = OUT / "day.txt"
    return not f.exists() or f.read_text().strip() != day.isoformat()


def build(day, speak, voice, rate, extras=()):
    """Makes the day's show. Returns True if it did."""
    if not ai.api_key() or not needs_build(day):
        return False
    try:
        songs = pick_songs(day)
        if not songs:
            return False
        show = write_show(day, songs, extras)
        OUT.mkdir(parents=True, exist_ok=True)
        for old in OUT.glob("*.m4a"):
            old.unlink()
        talk = [show["open"]] + show["intros"] + [show["close"]]
        (OUT / "show.txt").write_text("\n".join(talk) + "\n", encoding="utf-8")
        for i, text in enumerate(talk):
            speak(ai.clean(text, 300), voice, rate, OUT / f"{i:02d} YOLK.m4a")
        lines = []
        for i, song in enumerate(songs):
            if i == 0:
                lines.append("/Music/YOLK Radio/00 YOLK.m4a")
            lines.append(f"/Music/YOLK Radio/{i + 1:02d} YOLK.m4a")
            lines.append("/" + song)
        lines.append(f"/Music/YOLK Radio/{len(talk) - 1:02d} YOLK.m4a")
        (OUT / "today.m3u8").write_text("\n".join(lines) + "\n", encoding="utf-8")
        used_file = OUT / "used.json"
        used = json.loads(used_file.read_text()) if used_file.exists() else []
        used_file.write_text(json.dumps((used + songs)[-REMEMBER:]))
        (OUT / "day.txt").write_text(day.isoformat())
        return True
    except Exception as e:
        ai.log(f"radio failed: {e!r}")
        return False


def on_drive(shell, path):
    """`path` as it's actually spelled on SHELL (accents and capitals can differ), or None."""
    cur, out = shell, []
    for part in path.strip("/").split("/"):
        want = unicodedata.normalize("NFC", part).lower()       # the card ignores upper/lower case too
        try:
            found = next((n for n in os.listdir(cur) if unicodedata.normalize("NFC", n).lower() == want), None)
        except OSError:
            return None
        if found is None:
            return None
        cur = cur / found
        out.append(found)
    return "/" + "/".join(out)


def playlist_for(shell, lines):
    """Spells songs the way SHELL does. A missing song goes, along with the intro before it."""
    out = []
    for line in lines:
        if line.startswith("/Music/YOLK Radio/"):
            out.append(line)
            continue
        real = on_drive(shell, line)
        if real:
            out.append(real)
        else:
            ai.log(f"radio: not on SHELL, dropped: {line}")
            out.pop()
    return out


def deliver(shell):
    """Puts the latest show on SHELL (the drive's root), once per show."""
    day_file = OUT / "day.txt"
    if not day_file.exists() or not (shell / "YOLK").is_dir():
        return False
    day = day_file.read_text().strip()
    marker = shell / "YOLK" / "radio" / "day.txt"
    if marker.exists() and marker.read_text().strip() == day:
        return False
    music = shell / "Music" / "YOLK Radio"
    music.mkdir(parents=True, exist_ok=True)
    for old in music.glob("*YOLK.m4a"):
        old.unlink()
    for clip in sorted(OUT.glob("*.m4a")):
        (music / clip.name).write_bytes(clip.read_bytes())
    marker.parent.mkdir(exist_ok=True)
    lines = playlist_for(shell, (OUT / "today.m3u8").read_text(encoding="utf-8").splitlines())
    (shell / "YOLK" / "radio" / "today.m3u8").write_text("\n".join(lines) + "\n", encoding="utf-8")
    marker.write_text(day)
    return True


if __name__ == "__main__":
    import daily
    cfg = daily.config()
    target = daily.target_day()
    print("built" if build(target, daily.speak, cfg["voice"], cfg["rate"]) else "nothing new")
    if (OUT / "today.m3u8").exists():
        print((OUT / "today.m3u8").read_text())
