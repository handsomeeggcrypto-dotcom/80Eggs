#!/usr/bin/env python3
"""YOLK texts you first, now and then (by iMessage, to "text_to" in data/daily.json).

  python3 yolk/nudge.py            what she'd text about right now and why (sends nothing)
  python3 yolk/nudge.py --write    same, and has her write the text (sends nothing, ~1 cent)
  python3 yolk/nudge.py --log      the texts she's sent
  python3 yolk/nudge.py --test     send one now, through the running server

The server checks every 10 minutes (check()). Each day rolls its own dice (plan()): 0, 1, 2
or 3 texts of her own, each at a random time between 11am and 9:30pm, so some days are
silent and none are like clockwork. Never more than 3 a day (the morning text, timed
reminders, the Sunday letter and tests don't count), never within 90 minutes of her last
one or 2 hours of a chat. Urgent reasons (tomorrow, streak, wedding, payday) don't wait for
a planned time, but still count toward the 3. Reasons, most important first:
  reminder  a reminder you asked for at a set time (journal note with "at"): sent at that time,
            whatever the other limits say, up to LATE_OK late if the Mac was asleep
  tomorrow  a journal note is about tomorrow (evening before)
  streak    your meditation streak ends tonight if you don't (evening)
  quiet     you haven't talked to her in QUIET_DAYS days
  song      one song played over and over on SHELL this week
  wedding   a milestone day before the wedding (wedding.py; 200 days, 100, 30, 7...)
  payday    the day after a good paycheck, if the next one looks tight or short (finance.py,
            from the Finance page's Payday Planner): how much of this one to leave alone
  nestegg   Safe Scout (Nest Egg's practice bot) moved 10% in a day or hit a new high (eggwatch.py)
  thinking  nothing in particular; a planned time came and she brings up something she remembers
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
QUIET_DAYS = 4
JUST_TALKED = 2 * 3600                  # no text if you talked to her in the last 2 hours
SONG_PLAYS = 5
MAX_A_DAY = 3                           # her own texts a day, at most
SPACING = 1.5 * 3600                    # at least this long between two of her own texts
URGENT = ("tomorrow", "streak", "wedding", "payday")   # go whenever, not at a planned time
NOT_HERS = ("reminder", "letter", "test")      # texts that don't count toward her 3 a day
LATE_OK = 3 * 3600                      # a timed reminder still goes out this late (Mac asleep at the time)


def due(now=None):
    """Timed reminders whose time has come: (why, key, what)."""
    import journal
    now = now or dt.datetime.now()
    out = []
    for n in journal.read():
        if not n.get("at"):
            continue
        at = dt.datetime.strptime(n["on"] + " " + n["at"], "%Y-%m-%d %H:%M")
        if 0 <= (now - at).total_seconds() < LATE_OK:
            out.append(("reminder", f"at{n['id']}",
                        f"they asked you to remind them, and it's time ({n['at']}): {n['note']}. "
                        "make the reminder itself impossible to miss"))
    return out


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


def plan(day):
    """Today's dice: the hours (like 14.5 = 2:30pm) she'll text on her own, 0 to 3 of them.
    Same answer all day, so the server's checks agree with each other."""
    rng = random.Random("yolk-plan" + day.isoformat())
    count = rng.randint(0, MAX_A_DAY)                 # 0, 1, 2 or 3, equally likely
    for _ in range(200):                              # spread them out at least SPACING apart
        hours = sorted(round(rng.uniform(FIRST_HOUR, LAST_HOUR - 0.25), 2) for _ in range(count))
        if all(b - a >= SPACING / 3600 for a, b in zip(hours, hours[1:])):
            return hours
    return hours[:1]


def hers_on(day, history=None):
    """Her own texts on that day (not reminders, letters or tests)."""
    d = day.isoformat()
    return [s for s in (history if history is not None else sent())
            if s["why"] not in NOT_HERS and time.strftime("%Y-%m-%d", time.localtime(s["t"])) == d]


def reasons(now=None, n_today=0):
    """Every reason she has to text right now, most important first: (why, key, what, urgent).
    n_today = her ordinary texts so far today, so each "thinking" text is about a different note."""
    now = now or dt.datetime.now()
    hour = now.hour + now.minute / 60
    out = []
    import journal
    tomorrow = (now.date() + dt.timedelta(days=1)).isoformat()
    for n in journal.read():
        if n["on"] == tomorrow and hour >= EVENING and not n.get("at"):
            out.append(("tomorrow", f"note{n['id']}", f"remind them: {n['note']} (that's tomorrow)", True))
    med = server.meditation_stats()
    if med["streak"] >= 2 and not med["today"] and hour >= EVENING:
        out.append(("streak", now.date().isoformat(),
                    f"their meditation streak is {med['streak']} days and they haven't meditated today. "
                    "it breaks at midnight", True))
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
    try:
        import wedding
        wd = wedding.nudge_reason()
        if wd and hour >= 12:
            out.append(("wedding", wd[0], wd[1], True))
    except Exception:
        pass
    try:
        import finance
        pw = finance.payday_warning(now.date())
        if pw and hour >= 12:
            out.append(("payday", pw[0], pw[1], True))
    except Exception:
        pass
    try:
        import eggwatch
        egg = eggwatch.nudge_reason()
        if egg:
            out.append(("nestegg", egg[0], egg[1], False))
    except Exception:
        pass
    notes = journal.read()
    if notes:
        n = random.Random(f"{now.date().isoformat()}#{n_today}").choice(notes[-30:])
        out.append(("thinking", f"{now.date().isoformat()}#{n_today}",
                    f"no reason. you were thinking about something you remember: {n['note']}", False))
    return out


def pick(now=None, ignore_limits=False):
    """The one reason to text about right now, or None."""
    now = now or dt.datetime.now()
    hour = now.hour + now.minute / 60
    history = sent()
    done = {(s["why"], s["key"]) for s in history}
    for why, key, what in due(now):                   # a reminder they asked for beats every rule below
        if (why, key) not in done:
            return why, key, what
    mine = hers_on(now.date(), history)
    ordinary = [x for x in mine if x["why"] not in URGENT]
    if not ignore_limits:
        if not (FIRST_HOUR <= hour < LAST_HOUR):
            return None
        if len(mine) >= MAX_A_DAY:
            return None
        if time.time() - last_talk() < JUST_TALKED:
            return None
        if mine and time.time() - mine[-1]["t"] < SPACING:
            return None
    # a planned time has come and hasn't been used yet (if one was missed, e.g. the Mac
    # slept or they were chatting, it goes at the next check that's allowed)
    slot_open = len(ordinary) < sum(1 for h in plan(now.date()) if h <= hour)
    for why, key, what, urgent in reasons(now, len(ordinary)):
        if (why, key) in done:
            continue
        if ignore_limits:
            return why, key, what
        if urgent:
            return why, key, what
        if not slot_open or now.weekday() == 6:       # Sunday belongs to the letter (sunday.py)
            continue
        if why == "song" and any(s["why"] == "song" and time.time() - s["t"] < 14 * 86400 for s in history):
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


def record(why, key, text):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{int(time.time())}|{why}|{key}|{' '.join(text.split())}\n")


def test():
    """One text right now (the server runs this for --test). Returns what was sent."""
    import chat
    import daily
    who = daily.config().get("text_to")
    if not who:
        raise RuntimeError("no text_to in data/daily.json")
    text = chat.text_message("this is the very first text you've ever sent them from the mac. "
                             "they just set it up and are waiting to see if it arrives.")
    send(who, text)
    record("test", time.strftime("%Y-%m-%d"), text)
    return text


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
    record(why, key, text)
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
    if "--test" in sys.argv:
        import urllib.request
        req = urllib.request.Request("http://127.0.0.1:8008/api/nudge/test", data=b"{}", method="POST")
        try:
            print("sent:", json.loads(urllib.request.urlopen(req, timeout=180).read())["sent"])
        except urllib.error.HTTPError as e:
            print("didn't send:", json.loads(e.read()).get("error"))
    elif "--log" in sys.argv:
        for s in sent():
            print(time.strftime("%Y-%m-%d %H:%M", time.localtime(s["t"])), f"{s['why']:9s}", s["text"])
        print(f"{len(sent())} texts")
    else:
        found = reasons()
        print("reasons she has right now:" if found else "no reasons right now.")
        for why, key, what, urgent in found:
            print(f"  {why:9s} {what}")
        today = dt.date.today()
        hours = plan(today)
        print(f"\ntoday's dice: {len(hours)} text(s) of her own" + (" at " + ", ".join(
            dt.datetime.combine(today, dt.time()).replace(hour=int(h), minute=int(h % 1 * 60)).strftime("%-I:%M%p").lower()
            for h in hours) if hours else "") + f"; sent so far: {len(hers_on(today))}")
        p = pick()
        print("\nwould she text now?", f"yes, about {p[0]}" if p else "no (limits or quiet hours)")
        if "--write" in sys.argv:
            p = p or pick(ignore_limits=True)
            if p:
                import chat
                print(f"\nher text ({p[0]}), NOT sent:\n  {chat.text_message(p[2])}")
