#!/usr/bin/env python3
"""YOLK texts you first, now and then (by iMessage, to "text_to" in data/daily.json).

  python3 yolk/nudge.py            what she'd text about right now and why (sends nothing)
  python3 yolk/nudge.py --write    same, and has her write the text (sends nothing, ~1 cent)
  python3 yolk/nudge.py --log      the texts she's sent

The server checks every 10 minutes (check()). She sends at most one a day, between
NOON-ish and 9:30pm, never right after you've talked to her, and for the ordinary
reasons only every few days, so it stays rare. Reasons, most important first:
  tomorrow  a journal note is about tomorrow (evening before)
  streak    your meditation streak ends tonight if you don't (evening)
  quiet     you haven't talked to her in QUIET_DAYS days
  song      one song played over and over on SHELL this week
  thinking  nothing in particular; sometimes she just brings up something she remembers
Claude writes the words in her voice (chat.text_message). The server sends it, so the
first one makes macOS ask "YOLK wants to control Messages". Turn them off with
"nudges": false in data/daily.json. Log: data/nudges.txt  (unix|reason|key|text)
"""
import datetime as dt
import json
import random
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402

LOG = server.DATA / "nudges.txt"
FIRST_HOUR, LAST_HOUR = 11, 21.5        # never before 11am or after 9:30pm
EVENING = 19                            # "tomorrow" and "streak" wait until 7pm
GAP_DAYS = 2                            # ordinary reasons wait this long after the last text
QUIET_DAYS = 4
JUST_TALKED = 2 * 3600                  # no text if you talked to her in the last 2 hours
SONG_PLAYS = 5
THINKING_CHANCE = 0.3                   # on an otherwise-eligible day


def sent():
    out = []
    if LOG.exists():
        for line in LOG.read_text(encoding="utf-8").splitlines():
            p = line.split("|", 3)
            if len(p) == 4 and p[0].isdigit():
                out.append({"t": int(p[0]), "why": p[1], "key": p[2], "text": p[3]})
    return out


def last_talk():
    """When they last talked to her (any chat or letter), from the cost log."""
    import chat
    last = 0
    if chat.COST_LOG.exists():
        for line in chat.COST_LOG.read_text().splitlines():
            p = line.split("|")
            if len(p) == 7 and p[1] != "haiku":       # haiku = her note-taking; an 8th field = not a chat
                try:
                    last = time.mktime(time.strptime(p[0], "%Y-%m-%d %H:%M:%S"))
                except ValueError:
                    pass
    return last


def reasons(now=None):
    """Every reason she has to text right now, most important first: (why, key, what, urgent)."""
    now = now or dt.datetime.now()
    hour = now.hour + now.minute / 60
    out = []
    import journal
    tomorrow = (now.date() + dt.timedelta(days=1)).isoformat()
    for n in journal.read():
        if n["on"] == tomorrow and hour >= EVENING:
            out.append(("tomorrow", f"note{n['id']}", f"remind them: {n['note']} (that's tomorrow)", True))
    med = server.meditation_stats()
    if med["streak"] >= 2 and not med["today"] and hour >= EVENING:
        out.append(("streak", now.date().isoformat(),
                    f"their meditation streak is {med['streak']} days and they haven't meditated today. "
                    "it breaks at midnight", False))
    talked = last_talk()
    if talked and time.time() - talked > QUIET_DAYS * 86400:
        days = int((time.time() - talked) // 86400)
        out.append(("quiet", time.strftime("%Y-%m-%d", time.localtime(talked)),
                    f"they haven't talked to you in {days} days", False))
    try:
        import music
        songs = music.stats(7)["songs"]
        if songs and songs[0][1] >= SONG_PLAYS:
            (artist, title), n = songs[0]
            out.append(("song", f"{artist} - {title}",
                        f"they played {title} by {artist} {n} times this week on SHELL", False))
    except Exception:
        pass
    notes = journal.read()
    if notes:
        n = random.Random(now.date().isoformat()).choice(notes[-30:])
        out.append(("thinking", now.date().isoformat(),
                    f"no reason. you were thinking about something you remember: {n['note']}", False))
    return out


def pick(now=None, ignore_limits=False):
    """The one reason to text about right now, or None."""
    now = now or dt.datetime.now()
    hour = now.hour + now.minute / 60
    history = sent()
    today = now.date().isoformat()
    if not ignore_limits:
        if not (FIRST_HOUR <= hour < LAST_HOUR):
            return None
        if any(time.strftime("%Y-%m-%d", time.localtime(s["t"])) == today for s in history):
            return None                               # one a day at most
        if time.time() - last_talk() < JUST_TALKED:
            return None
        # each day has its own random hour for ordinary texts, so they don't come like clockwork
        rng = random.Random("yolk" + today)
        if hour < FIRST_HOUR + rng.random() * (EVENING + 1 - FIRST_HOUR):
            return None
    done = {(s["why"], s["key"]) for s in history}
    since_last = (time.time() - history[-1]["t"]) / 86400 if history else 99
    for why, key, what, urgent in reasons(now):
        if (why, key) in done:
            continue
        if ignore_limits:
            return why, key, what
        if not urgent and since_last < GAP_DAYS:
            continue
        if why == "song" and any(s["why"] == "song" and time.time() - s["t"] < 14 * 86400 for s in history):
            continue
        if why == "thinking" and random.Random("think" + today).random() > THINKING_CHANCE:
            continue
        return why, key, what
    return None


def send(who, text):
    """Sends by iMessage. Runs inside the server (YOLK.app), which macOS asks about once."""
    script = """on run argv
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    send (item 2 of argv) to participant (item 1 of argv) of svc
  end tell
end run"""
    r = subprocess.run(["osascript", "-e", script, who, text], capture_output=True, text=True, timeout=120)
    if r.returncode:
        raise RuntimeError(r.stderr.strip() or "osascript failed")


def check():
    """Called by the server every 10 minutes. Sends at most one text."""
    import daily
    cfg = daily.config()
    if cfg.get("nudges") is False or not cfg.get("text_to"):
        return None
    choice = pick()
    if not choice:
        return None
    why, key, what = choice
    import chat
    text = chat.text_message(what)
    send(cfg["text_to"], text)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{int(time.time())}|{why}|{key}|{' '.join(text.split())}\n")
    return why, text


def for_chat():
    """Her recent texts, so a chat after one knows she sent it."""
    recent = [s for s in sent() if time.time() - s["t"] < 3 * 86400]
    if not recent:
        return None
    return "texts you sent them lately, out of nowhere: " + "; ".join(
        f"{time.strftime('%a %I:%M %p', time.localtime(s['t'])).replace(' 0', ' ').lower()}: \"{s['text']}\""
        for s in recent)


if __name__ == "__main__":
    if "--log" in sys.argv:
        for s in sent():
            print(time.strftime("%Y-%m-%d %H:%M", time.localtime(s["t"])), f"{s['why']:9s}", s["text"])
        print(f"{len(sent())} texts")
    else:
        found = reasons()
        print("reasons she has right now:" if found else "no reasons right now.")
        for why, key, what, urgent in found:
            print(f"  {why:9s} {what}")
        p = pick()
        print("\nwould she text now?", f"yes, about {p[0]}" if p else "no (limits or quiet hours)")
        if "--write" in sys.argv:
            p = p or pick(ignore_limits=True)
            if p:
                import chat
                print(f"\nher text ({p[0]}), NOT sent:\n  {chat.text_message(p[2])}")
