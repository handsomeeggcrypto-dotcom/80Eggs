#!/usr/bin/env python3
"""What you've been listening to on SHELL, so YOLK can notice.

SHELL's Rockbox writes every song played to /.rockbox/playback.log (the
HATCHERY switches the log on). Whenever SHELL is plugged in, the new lines are
copied to data/plays.txt. From those, YOLK knows your favorites and repeats:
  - in chats on the Mac and the Station (chat.details)
  - on SHELL, where Talk to YOLK says the lines in /YOLK/music.txt
  - in YOLK Radio, which picks more songs by the artists you've been playing

  python3 yolk/music.py      this week's listening, and what she'd say about it

data/plays.txt, one per line:  time|listened ms|length ms|path
`time` is SHELL's clock, which is local time counted like unix time.
The play log on SHELL is only read, never changed (the HATCHERY reads it too).
"""
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402

PLAYS = server.DATA / "plays.txt"
LINE = re.compile(r"^(\d+):(\d+):(\d+):(/.+)$")
SKIP_MS = 30 * 1000        # stopped within 30 seconds of a song longer than a minute = skipped


def song(path):
    """(artist, title) for a real song, or None for YOLK's own clips and meditation audio."""
    if path.startswith(("/Music/YOLK Radio/", "/Music/YOLK Daily/", "/YOLK/")):
        return None
    import radio
    return radio.song_name(path.lstrip("/"))


def read():
    plays = []
    if PLAYS.exists():
        for line in PLAYS.read_text(encoding="utf-8").splitlines():
            p = line.split("|", 3)
            if len(p) == 4 and p[0].isdigit():
                plays.append({"t": int(p[0]), "ms": int(p[1]), "len": int(p[2]), "path": p[3]})
    return plays


def collect(shell):
    """Copies new plays from SHELL's play log(s). Returns how many were new."""
    rb = shell.parent / ".rockbox"
    logs = sorted(rb.glob("playback_*.log")) + [rb / "playback.log"]   # full logs get renamed
    have = {(p["t"], p["path"]) for p in read()}
    new = []
    for log in logs:
        if not log.exists():
            continue
        for line in log.read_text(encoding="utf-8", errors="replace").splitlines():
            m = LINE.match(line.strip())
            if not m:
                continue
            t, ms, length, path = int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4)
            if (t, path) in have:
                continue
            have.add((t, path))
            new.append(f"{t}|{ms}|{length}|{path}\n")
    if new:
        PLAYS.parent.mkdir(parents=True, exist_ok=True)
        with open(PLAYS, "a", encoding="utf-8") as f:
            f.writelines(new)
    return len(new)


def now_shell():
    """The current time the way SHELL's clock counts it."""
    t = time.time()
    return int(t + time.localtime(t).tm_gmtoff)


def stats(days=7):
    """Listening over the last `days` days."""
    since = now_shell() - days * 86400
    songs, artists, skips, late, ms = {}, {}, {}, 0, 0
    for p in read():
        if p["t"] < since:
            continue
        name = song(p["path"])
        if not name:
            continue
        ms += min(p["ms"], p["len"] or p["ms"])
        if p["ms"] < SKIP_MS and p["len"] > 60 * 1000:
            skips[name] = skips.get(name, 0) + 1
            continue
        songs[name] = songs.get(name, 0) + 1
        artists[name[0]] = artists.get(name[0], 0) + 1
        if p["t"] % 86400 < 4 * 3600:             # between midnight and 4am
            late += 1
    top = lambda d: sorted(d.items(), key=lambda kv: -kv[1])
    return {"days": days, "plays": sum(songs.values()), "minutes": ms // 60000, "late": late,
            "songs": top(songs), "artists": top(artists), "skips": top(skips)}


def for_chat():
    """A line for her instructions in Mac/Station chats, or None."""
    s = stats(7)
    if not s["plays"]:
        return None
    parts = [f"{s['minutes']} minutes of music, {s['plays']} songs"]
    if s["songs"]:
        parts.append("most played: " + ", ".join(f"{t} by {a} ({n}x)" for (a, t), n in s["songs"][:3]))
    if s["artists"]:
        parts.append("top artists: " + ", ".join(a for a, _ in s["artists"][:3]))
    if s["skips"]:
        (a, t), n = s["skips"][0]
        parts.append(f"skipped {t} by {a} {n}x")
    if s["late"]:
        parts.append(f"{s['late']} songs between midnight and 4am")
    return "what they played on SHELL this week: " + "; ".join(parts)


def remarks():
    """Short things YOLK can say on SHELL about your listening (lowercase, fits her bubble)."""
    s = stats(7)
    out = []
    if s["songs"]:
        (a, t), n = s["songs"][0]
        if n >= 4:
            out.append(f"you played {t} {n} times this week. are you ok.")
        elif n >= 2:
            out.append(f"{t} again. i see you.")
    if s["artists"]:
        a, n = s["artists"][0]
        if n >= 5:
            out.append(f"{n} {a} songs this week. i'm starting to like them. don't tell them.")
    if s["minutes"] >= 60:
        out.append(f"{s['minutes'] // 60} hours of music this week. i heard every second.")
    elif s["minutes"] >= 10:
        out.append(f"{s['minutes']} minutes of music this week. i want more.")
    if s["skips"]:
        (a, t), n = s["skips"][0]
        if n >= 2:
            out.append(f"you skipped {t} {n} times. it's not its fault.")
    if s["late"] >= 3:
        out.append(f"{s['late']} songs after midnight this week. i was awake too.")
    if len(s["songs"]) >= 2:
        (a, t), _ = s["songs"][1]
        out.append(f"{t} by {a}. good one. i'd hum it if i had a mouth.")
    return [" ".join(r.lower().split())[:120] for r in out]


def favorite_artists(days=30, n=6):
    return [a for a, _ in stats(days)["artists"][:n]]


def for_radio():
    """Extra details for YOLK Radio's script, so she can mention your listening."""
    s = stats(7)
    if not s["songs"]:
        return []
    (a, t), k = s["songs"][0]
    return [f"Their most played song on SHELL this week: {t} by {a} ({k} times). Tease them about it at most once."]


def deliver(shell):
    """Writes her remarks to SHELL as /YOLK/music.txt, one per line (latin-1 for its font)."""
    (shell / "music.txt").write_text("".join(r + "\n" for r in remarks()), encoding="latin-1", errors="replace")


def on_sync(shell):
    collect(shell)
    deliver(shell)


if __name__ == "__main__":
    s = stats(7)
    print(f"last 7 days: {s['plays']} songs, {s['minutes']} minutes, {s['late']} after midnight")
    for (a, t), n in s["songs"][:10]:
        print(f"  {n:3d}x  {t} - {a}")
    if s["skips"]:
        print("skipped:", ", ".join(f"{t} ({n}x)" for (a, t), n in s["skips"][:5]))
    print("\nshe'd say:")
    for r in remarks():
        print("  " + r)
