#!/usr/bin/env python3
"""YOLK's Sunday letter: once a week she writes you about your week and texts it.

  python3 yolk/sunday.py            this week's letter (writes it if needed; sends nothing)
  python3 yolk/sunday.py --facts    what she knows about the week, without writing

On Sunday evening (SEND_FROM to 9:30pm) the server's nudge loop calls check(), which
writes the letter and sends it by iMessage to "text_to". It's written from the week's
check-ins and meditation (ai.week_facts), what she wrote in her journal this week,
your chats with her, her texts, what you played on SHELL and Nest Egg (all in
chat.details). Saved to data/sunday/<date>.txt; the desktop terminal's
"read your sunday letter" shows the newest (GET /api/letter, this Mac only).
It goes in data/nudges.txt too, so she doesn't text anything else that day.
SHELL keeps its own shorter weekly note (ai.weekly -> /YOLK/review.txt).
"""
import datetime as dt
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402

OUT = server.DATA / "sunday"
SEND_FROM = 18          # 6pm
SEND_UNTIL = 21.5

LETTER = """

This time it's your Sunday letter: once a week you write them about their week, and it arrives by text.
Write four to seven short sentences in one or two short paragraphs: lowercase, plain words, no lists,
no emoji, no markdown, no greeting line. End with a short sign-off line, like "- yolk" or something
stranger in the same spirit. Use only the facts you're given: never invent a pattern from too little
data, and if the week was thin, say so honestly. Notice one or two real things (something that went well,
something they told you, a song, the practice bots), and if the facts show one, one gentle thing to try
next week. Be kind, not preachy. No medical or financial advice.

This week:
{week}"""


def week_lines(today=None):
    """What happened this week, beyond what chat.details already has."""
    today = today or dt.date.today()
    since = time.time() - 7 * 86400
    lines = []
    import ai
    facts = ai.week_facts(today)
    lines.append(facts or "no check-ins this week.")
    import journal
    new = [n["note"] for n in journal.read() if n["t"] > since]
    if new:
        lines.append("things you wrote in your journal this week: " + "; ".join(new))
    import chat
    chats = 0
    if chat.COST_LOG.exists():
        for line in chat.COST_LOG.read_text().splitlines():
            p = line.split("|")
            if len(p) == 7 and p[1] != "haiku":
                try:
                    if time.mktime(time.strptime(p[0], "%Y-%m-%d %H:%M:%S")) > since:
                        chats += 1
                except ValueError:
                    pass
    lines.append(f"they talked to you {chats} times this week (messages, any body)."
                 if chats else "they didn't talk to you at all this week.")
    import nudge
    texts = [s["text"] for s in nudge.sent() if s["t"] > since and s["why"] not in ("letter", "test")]
    if texts:
        lines.append("texts you sent them this week: " + "; ".join(f'"{t}"' for t in texts))
    return "\n".join(lines)


def path_for(day):
    return OUT / f"{day.isoformat()}.txt"


def write(day=None):
    """This week's letter (cached per Sunday, or per day when run by hand on another day)."""
    day = day or dt.date.today()
    f = path_for(day)
    if f.exists():
        return f.read_text(encoding="utf-8")
    import ai
    import chat
    key = ai.api_key()
    if not key:
        raise RuntimeError("no api key")
    brain = chat.settings()["brain"]
    import anthropic
    client = anthropic.Anthropic(api_key=key, timeout=120.0)
    args = dict(model=chat.BRAINS[brain][0], max_tokens=16000,
                system=chat.details("text") + LETTER.format(week=week_lines(day)),
                messages=[{"role": "user", "content": "(write this week's letter now)"}],
                thinking={"type": "adaptive"}, output_config={"effort": "medium"})
    if brain in ("opus", "sonnet"):
        args.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        response = client.beta.messages.create(**args)
    else:
        response = client.messages.create(**args)
    chat.log_cost(brain, response.usage, tag="letter")
    text = "\n".join(b.text for b in response.content if b.type == "text").strip()
    text = re.sub(r"[*_#`]", "", text)
    if response.stop_reason == "refusal" or not text:
        raise RuntimeError("no letter written")
    OUT.mkdir(parents=True, exist_ok=True)
    f.write_text(text, encoding="utf-8")
    return text


def latest():
    found = sorted(OUT.glob("*.txt")) if OUT.is_dir() else []
    if not found:
        return None
    f = found[-1]
    return {"day": f.stem, "text": f.read_text(encoding="utf-8")}


def check(now=None):
    """Called by the server every 10 minutes: on Sunday evening, write and text the letter once."""
    now = now or dt.datetime.now()
    hour = now.hour + now.minute / 60
    if now.weekday() != 6 or not (SEND_FROM <= hour < SEND_UNTIL):
        return None
    import daily
    import nudge
    cfg = daily.config()
    if cfg.get("sunday_letter") is False or not cfg.get("text_to"):
        return None
    today = now.date().isoformat()
    if any(s["why"] == "letter" and s["key"] == today for s in nudge.sent()):
        return None
    text = write(now.date())
    nudge.send(cfg["text_to"], "🥚 sunday letter\n\n" + text)
    nudge.record("letter", today, text)
    return text


if __name__ == "__main__":
    if "--facts" in sys.argv:
        print(week_lines())
    else:
        print(write())
