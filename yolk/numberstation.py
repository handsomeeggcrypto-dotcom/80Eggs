#!/usr/bin/env python3
"""YOLK's Numbers Station: now and then the Station tablet turns into a shortwave
broadcast. Static, a chime, her voice reading groups of digits, twice, then
"end of transmission". The digits are a short coded message from her.

  python3 yolk/numberstation.py           the mode, today's slot and the last broadcast, decoded
  python3 yolk/numberstation.py --off     no broadcasts at all
  python3 yolk/numberstation.py --quiet   broadcasts on screen only, no sound
  python3 yolk/numberstation.py --on      broadcasts with sound
  python3 yolk/numberstation.py --now     play one on the Station within a minute (any mode but off)

It can also be switched from the Station itself (buttons on the broadcast
screen: "stop" and "turn it off") and from the desktop terminal ("numbers
station"). Settings live in data/numbers.json:
  mode   "on" | "quiet" | "off"
  from, to   the hours it may happen in (default 19 to 22, evenings)
  chance     how likely a broadcast is on a given day (default 0.5)
At most one random broadcast a day, at a random time inside the hours; the Station
plays it the first moment it's sitting on its clock screen.

The code: each letter is two digits (a=01 ... z=26, space=00), run together and cut
into groups of five, padded with zeros. Decode by joining the groups and reading
the digits in pairs. The desktop terminal can decode the last one for you.
"""
import json
import random
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402

SETTINGS = server.DATA / "numbers.json"
DEFAULTS = {"mode": "on", "from": 19, "to": 22, "chance": 0.5}
MODES = ("on", "quiet", "off")
DIGITS = "zero one two three four five six seven eight nine".split()

MESSAGES = [
    "i see you", "drink water", "go to sleep", "egg is watching", "shell remembers",
    "you are loved", "check the fridge", "i never sleep", "look behind you", "stay warm",
    "call your mom", "the yolk knows", "breathe slowly", "touch grass", "hello from the mac",
    "you did good today", "dont be scared", "i am in the walls", "feed the egg", "goodnight",
]


def load():
    s = dict(DEFAULTS)
    if SETTINGS.exists():
        try:
            s.update(json.loads(SETTINGS.read_text()))
        except json.JSONDecodeError:
            pass
    if s["mode"] not in MODES:
        s["mode"] = "on"
    return s


def save(s):
    server.DATA.mkdir(parents=True, exist_ok=True)
    tmp = SETTINGS.with_suffix(".tmp")
    tmp.write_text(json.dumps(s, indent=2) + "\n")
    tmp.replace(SETTINGS)


def encode(message):
    digits = "".join("00" if c == " " else "%02d" % (ord(c) - 96) for c in message.lower() if c == " " or c.isalpha())
    digits += "0" * (-len(digits) % 5)
    return [digits[i:i + 5] for i in range(0, len(digits), 5)]


def decode(groups):
    digits = "".join(groups)
    out = ""
    for i in range(0, len(digits) - 1, 2):
        n = int(digits[i:i + 2])
        out += " " if n == 0 else (chr(96 + n) if n <= 26 else "?")
    return out.strip()


def spoken(groups):
    """How the voice reads them: digit by digit, a pause after each group."""
    return ". ".join(" ".join(DIGITS[int(d)] for d in g) for g in groups) + "."


def slot(day, s):
    """Today's broadcast time as hours (like 20.5), or None if today has none."""
    rng = random.Random("numbers" + day)
    if rng.random() > s["chance"]:
        return None
    return s["from"] + rng.random() * max(0.1, s["to"] - s["from"] - 0.25)


def make(message=None):
    message = message or random.choice(MESSAGES)
    groups = encode(message)
    return {"id": "%d" % (time.time() * 1000), "groups": groups, "spoken": spoken(groups),
            "message": message, "t": int(time.time())}


def status(now=None):
    """What the Station asks every minute: the mode, and a broadcast if one is due now."""
    s = load()
    lt = time.localtime(now or time.time())
    day = time.strftime("%Y-%m-%d", lt)
    hour = lt.tm_hour + lt.tm_min / 60
    due = None
    if s["mode"] != "off":
        if s.get("pending"):
            due = s["pending"]
        else:
            at = slot(day, s)
            if at is not None and at <= hour < s["to"] and s.get("played_day") != day:
                due = s.get("today") if (s.get("today") or {}).get("day") == day else None
                if not due:
                    due = dict(make(), day=day)
                    s["today"] = due
                    save(s)
    out = {"mode": s["mode"]}
    if due:
        out["broadcast"] = {k: due[k] for k in ("id", "groups", "spoken")}
    return out


def played(bid):
    s = load()
    for k in ("pending", "today"):
        b = s.get(k)
        if b and b.get("id") == bid:
            s["last"] = {x: b[x] for x in ("id", "groups", "message", "t")}
            s["last"]["t"] = int(time.time())
            if k == "pending":
                s.pop("pending")
            else:
                s["played_day"] = b.get("day")
    save(s)


def set_mode(mode):
    s = load()
    if mode in MODES:
        s["mode"] = mode
        if mode == "off":
            s.pop("pending", None)
        save(s)
    return s["mode"]


def now():
    s = load()
    if s["mode"] == "off":
        return False
    s["pending"] = make()
    save(s)
    return True


def handle(body):
    """POST /api/numbers from the Station or the terminal."""
    if body.get("played"):
        played(str(body["played"]))
    if body.get("mode"):
        set_mode(body["mode"])
    if body.get("now"):
        now()
    s = load()
    out = {"mode": s["mode"]}
    if body.get("decode") and s.get("last"):
        out["last"] = s["last"]
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    for flag in ("--off", "--quiet", "--on"):
        if flag in args:
            print("numbers station:", set_mode(flag[2:]))
            sys.exit(0)
    if "--now" in args:
        print("queued; the Station plays it within a minute." if now() else "it's off. turn it on first.")
        sys.exit(0)
    s = load()
    day = time.strftime("%Y-%m-%d")
    at = slot(day, s)
    print(f"mode: {s['mode']}   hours: {s['from']}:00 to {s['to']}:00   chance per day: {s['chance']}")
    print("today:", "no broadcast" if at is None else time.strftime("%H:%M", time.gmtime(at * 3600))
          + (" (already played)" if s.get("played_day") == day else ""))
    if s.get("last"):
        b = s["last"]
        print("last broadcast:", time.strftime("%a %H:%M", time.localtime(b["t"])), " ".join(b["groups"]),
              "->", decode(b["groups"]))
