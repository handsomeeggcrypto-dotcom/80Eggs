#!/usr/bin/env python3
"""YOLK's shared memory: one journal on the Mac that all her bodies use.

After you talk to her (typing on the Mac or out loud on the Station), a small,
cheap Claude reads the conversation and writes down anything worth keeping:
plans, likes, people, how you've been. It also crosses out notes that are
out of date or that you asked her to forget. Every new conversation, on any
body, starts with her reading the journal. SHELL gets the newest notes each
time it's plugged in (/YOLK/remember.txt) and can bring them up.

  python3 yolk/journal.py            everything she remembers
  python3 yolk/journal.py --forget 7 cross out note 7

data/journal.txt, one note per line:  id|unix time|where|note[|yyyy-mm-dd]
(the date, when there is one, is the day the note is about, so SHELL can
bring it up on that day)
It's personal, so it lives in data/ (gitignored) and never leaves this Mac.
"""
import json
import re
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402  (DATA, SHELL)

JOURNAL = server.DATA / "journal.txt"
NEXT_ID = server.DATA / "journal_next_id.txt"
MAX_NOTES = 200          # about 5,000 words; the oldest go first past this
NOTE_LEN = 110           # short enough for SHELL's speech bubble
FOR_SHELL = 15           # newest notes copied to SHELL
NOTE_MODEL = "claude-haiku-5-5"
PLACES = {"desk": "the mac", "station": "the station", "shell": "shell"}

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_lock = threading.Lock()


def read():
    notes = []
    if JOURNAL.exists():
        for line in JOURNAL.read_text(encoding="utf-8").splitlines():
            parts = line.split("|")
            if len(parts) in (4, 5) and parts[0].isdigit() and parts[1].isdigit():
                day = parts[4] if len(parts) == 5 and DATE.match(parts[4]) else ""
                notes.append({"id": int(parts[0]), "t": int(parts[1]), "where": parts[2], "note": parts[3],
                              "on": day})
    return notes


def _write(notes):
    JOURNAL.parent.mkdir(parents=True, exist_ok=True)
    tmp = JOURNAL.with_suffix(".tmp")
    tmp.write_text("".join(f"{n['id']}|{n['t']}|{n['where']}|{n['note']}" + (f"|{n['on']}" if n.get("on") else "")
                           + "\n" for n in notes), encoding="utf-8")
    tmp.replace(JOURNAL)


def clean(text):
    text = re.sub(r"[\s|]+", " ", str(text)).strip().lower()
    if len(text) > NOTE_LEN:                        # cut at a word, not in the middle of one
        text = text[:NOTE_LEN].rsplit(" ", 1)[0].rstrip(",;:- ") + "..."
    return text


def change(add=(), forget=(), where="desk"):
    """Adds notes and crosses out notes by id. Returns the journal after.
    Each note to add is text, or {"note": text, "on": "yyyy-mm-dd"} for one about a certain day."""
    with _lock:
        notes = read()
        gone = {int(i) for i in forget if str(i).isdigit()}
        notes = [n for n in notes if n["id"] not in gone]
        # ids are never reused (SHELL uses them to know which notes it has already brought up)
        try:
            last = int(NEXT_ID.read_text())
        except (OSError, ValueError):
            last = 0
        next_id = max([n["id"] for n in read()] + [last - 1, 0]) + 1
        now = int(time.time())
        have = {n["note"] for n in notes}
        for a in add:
            day = (a.get("on") or "") if isinstance(a, dict) else ""
            a = clean(a.get("note", "") if isinstance(a, dict) else a)
            day = day if DATE.match(str(day)) else ""
            if a and a not in have:
                notes.append({"id": next_id, "t": now, "where": where, "note": a, "on": day})
                have.add(a)
                next_id += 1
        _write(notes[-MAX_NOTES:])
        NEXT_ID.write_text(str(next_id))
        return notes[-MAX_NOTES:]


def when(t):
    lt = time.localtime(t)
    return time.strftime("%b ", lt).lower() + str(lt.tm_mday)


def for_prompt():
    """The journal, the way YOLK reads it at the start of a conversation."""
    notes = read()
    if not notes:
        return ("Your memory: nothing yet. You share one memory across all your bodies (the Mac, the "
                "Station and SHELL). Anything they tell you now, you'll keep.")
    lines = [f"- {when(n['t'])}, on {PLACES.get(n['where'], n['where'])}: {n['note']}" for n in notes]
    return ("Your memory. You share one memory across all your bodies (the Mac, the Station and SHELL), so "
            "something said on one is known on all of them. These are your notes about them, oldest first. "
            "Bring one up when it fits, like someone who really listened. Don't recite the list.\n"
            + "\n".join(lines))


NOTE_TAKER = """You keep the memory journal of YOLK, a small egg-shaped AI companion. Below are her current
notes about her owner, then a conversation they just had on {place}.

Decide what she should remember. Write notes for things that will still matter later: plans and dates,
people and pets in their life, likes and dislikes, projects, worries, wins, how they've been feeling,
promises she made, and anything they ask her to remember. Skip small talk, oracle questions, jokes and
anything already in the notes. Keep each note under 100 characters, one fact per note. Write each note
as YOLK talking to them: lowercase, short, starting with
"you" where it fits (like "you have a dentist appointment friday, nov 6" or "your sister's name is ana").
Turn words like "tomorrow" or "friday" into the actual date. Today is {today}. When a note is about
a certain day (an appointment, a trip, a birthday, a deadline), also give that day as "on".

Cross out (forget) notes that this conversation shows are wrong or out of date, or that they ask her to
forget. When something changes, forget the old note and add a new one. Never write down passwords, card
numbers, seed phrases or private keys.

Answer with only JSON: {{"add": [{{"note": "...", "on": "yyyy-mm-dd or null"}}, ...], "forget": [id, ...]}}.
Both lists can be empty, and usually are.

Current notes:
{notes}

The conversation:
{talk}"""


def take_notes(messages, where="desk"):
    """Reads a finished stretch of conversation and updates the journal. Returns (added, forgot)."""
    if not messages:
        return [], []
    import ai
    key = ai.api_key()
    if not key:
        return [], []
    import anthropic
    notes = read()
    talk = "\n".join(("THEM: " if m["role"] == "user" else "YOLK: ") + str(m["content"]) for m in messages)
    prompt = NOTE_TAKER.format(
        place=PLACES.get(where, where),
        today=time.strftime("%A, %B ") + str(time.localtime().tm_mday) + time.strftime(", %Y"),
        notes="\n".join(f"{n['id']}: {n['note']}" for n in notes) or "(none yet)",
        talk=talk[-12000:])
    client = anthropic.Anthropic(api_key=key, timeout=60.0)
    response = client.messages.create(model=NOTE_MODEL, max_tokens=1000,
                                      messages=[{"role": "user", "content": prompt}])
    try:
        import chat
        chat.log_cost("haiku", response.usage)
    except Exception:
        pass
    text = " ".join(b.text for b in response.content if b.type == "text")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return [], []
    try:
        out = json.loads(m.group(0))
    except json.JSONDecodeError:
        return [], []
    add = [a for a in out.get("add", []) if isinstance(a, (str, dict))][:10]
    forget = [i for i in out.get("forget", []) if isinstance(i, int) or str(i).isdigit()]
    before = {n["id"] for n in notes}
    change(add, forget, where)
    return add, [i for i in forget if int(i) in before]


def day_number(day):
    """yyyy-mm-dd -> days since 1970, the way SHELL counts them (its clock is local time)."""
    import datetime as dt
    return (dt.date.fromisoformat(day) - dt.date(1970, 1, 1)).days


def deliver(shell):
    """Copies notes to SHELL as /YOLK/remember.txt: id|where|note|day (latin-1 for its font).
    That's the newest few, plus every note about a day that hasn't passed yet (day 0 = none)."""
    notes = read()
    today = time.strftime("%Y-%m-%d")
    keep = {n["id"] for n in notes[-FOR_SHELL:]} | {n["id"] for n in notes if n["on"] and n["on"] >= today}
    text = "".join(f"{n['id']}|{PLACES.get(n['where'], n['where'])}|{n['note']}|"
                   f"{day_number(n['on']) if n['on'] else 0}\n" for n in notes if n["id"] in keep)
    (shell / "remember.txt").write_text(text, encoding="latin-1", errors="replace")


if __name__ == "__main__":
    if "--forget" in sys.argv:
        ids = [a for a in sys.argv[sys.argv.index("--forget") + 1:] if a.isdigit()]
        change(forget=ids)
        print(f"forgot {', '.join(ids) or 'nothing'}")
    else:
        notes = read()
        for n in notes:
            print(f"{n['id']:4d}  {when(n['t']):7s} {PLACES.get(n['where'], n['where']):12s} {n['note']}")
        print(f"{len(notes)} notes" if notes else "she doesn't remember anything yet")
