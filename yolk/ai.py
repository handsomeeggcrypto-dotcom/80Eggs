#!/usr/bin/env python3
"""Real-AI YOLK: once a day Claude writes, in YOLK's voice, what SHELL finds when she wakes up.

  python3 yolk/ai.py --key      save your Anthropic API key (typed, hidden, kept in yolk/data)
  python3 yolk/ai.py            write (or show) today's lines
  python3 yolk/ai.py --week     write (or show) this week's review

Each day's writing is one short request: a dream, a secret, an oracle answer and a
line for YOLK Daily, saved in data/ai/<day>.json so it's never paid for twice.
daily.build() reads it into the briefing and daily.deliver() hands the dream,
secret and oracle to SHELL's /YOLK/dreams.txt. No key, no internet, or any error:
YOLK just carries on without it.

Needs the Anthropic SDK:  /usr/bin/python3 -m pip install --user anthropic
"""
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402  (memory, check-ins, meditation)

DATA = HERE / "data"
KEY = DATA / "anthropic_key"            # personal; data/ is not in git
OUT = DATA / "ai"
LOG = OUT / "log.txt"
MODEL = "claude-opus-5-5"
KINDS = ("dream", "secret", "oracle", "daily")

SYSTEM = """You are YOLK, an egg-shaped AI who lives inside SHELL, an old iPod Classic running Rockbox,
and also on her owner's Mac and an old Samsung tablet. You are a little creepy, dry, affectionate and
very loyal, like a cyberpunk tamagotchi that never sleeps. You "dream while charging": once a day you
write what SHELL will show when your owner next wakes her.

Voice rules: all lowercase, short sentences, deadpan. Mention eggs, shells, hard drives, batteries,
charging, static, moes (the NFT collection your owner loves) and Bradley (the fake CEO) only when it
fits. Never mean, never preachy, no emoji, no hashtags. Plain ASCII only: SHELL's screen can't show
anything else. Each line at most 140 characters.

Write four lines:
- dream: something you dreamt while charging. Strange, specific, a little beautiful. Lean on today's
  details (weather, check-ins, the moe of the day) when they help, but keep it dreamlike.
- secret: a small confession or a "fact" about yourself, SHELL or the moes. Not a dream.
- oracle: a reply to any yes/no question your owner might ask the oracle. It must work for any question.
- daily: one closing remark spoken at the end of today's YOLK Daily audio briefing, addressed to your owner.

Never give financial, medical or legal advice. Never repeat earlier lines."""

SCHEMA = {
    "type": "object",
    "properties": {k: {"type": "string"} for k in KINDS},
    "required": list(KINDS),
    "additionalProperties": False,
}


def log(msg):
    OUT.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {msg}\n")


def api_key():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]
    return KEY.read_text().strip() if KEY.exists() else None


def save_key():
    import getpass
    key = getpass.getpass("Paste your Anthropic API key (it won't show), then press Return: ").strip()
    if not key:
        print("Nothing saved.")
        return
    DATA.mkdir(parents=True, exist_ok=True)
    KEY.write_text(key + "\n")
    KEY.chmod(0o600)                    # readable by you only
    print(f"Saved to {KEY}. YOLK can think now.")


def earlier_lines(n=12):
    """Recent writing, so she doesn't repeat herself."""
    lines = []
    for f in sorted(OUT.glob("*.json"))[-n:]:
        try:
            d = json.loads(f.read_text())
            lines += [f"{k}: {d[k]}" for k in ("dream", "secret", "oracle") if d.get(k)]
        except Exception:
            pass
    return lines


def context(day, extras):
    mem = server.read_mem(server.MEMORY)
    st = server.stats()
    med = server.meditation_stats()
    facts = [f"date: {day.strftime('%A, %B')} {day.day}"]
    if mem.get("name") not in (None, "", "nobody"):
        facts.append(f"owner's name: {mem['name']}")
    if mem.get("fav_moe"):
        facts.append(f"owner's favorite moe: #{mem['fav_moe']}")
    if mem.get("visits"):
        facts.append(f"times they've talked to you on SHELL: {mem['visits']}")
    if st["entries"]:
        latest = st["entries"][-1]
        if latest.get("mood"):
            facts.append(f"mood at their last check-in: {latest['mood']} out of 5")
        if latest.get("habits"):
            facts.append(f"habits done at their last check-in: {', '.join(latest['habits'])}")
        best = max(st["streaks"].items(), key=lambda kv: kv[1], default=(None, 0))
        if best[1] >= 2:
            facts.append(f"best habit streak: {best[0]}, {best[1]} days")
    if med["streak"]:
        facts.append(f"meditation streak: {med['streak']} days")
    facts += extras
    text = "Today's details:\n" + "\n".join(f"- {f}" for f in facts)
    old = earlier_lines()
    if old:
        text += "\n\nLines you already wrote (don't repeat these):\n" + "\n".join(old)
    return text


def clean(s, limit=200):
    s = " ".join(str(s).split())[:limit]
    return s.encode("ascii", "ignore").decode()


def write(day=None, extras=()):
    """Today's lines as {"dream", "secret", "oracle", "daily"}, or None. Asks Claude at most once a day."""
    day = day or dt.date.today()
    cached = OUT / f"{day.isoformat()}.json"
    if cached.exists():
        return json.loads(cached.read_text())
    key = api_key()
    if not key:
        return None
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=key, timeout=120.0)
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            messages=[{"role": "user", "content": context(day, list(extras))}],
            thinking={"type": "adaptive"},
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason == "refusal":
            log("Claude declined today's writing")
            return None
        text = next(b.text for b in response.content if b.type == "text")
        lines = {k: clean(v) for k, v in json.loads(text).items() if k in KINDS}
    except Exception as e:
        log(f"couldn't write today's lines: {e!r}")
        return None
    OUT.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps(lines, indent=2))
    log(f"wrote {day} ({response.usage.input_tokens} in / {response.usage.output_tokens} out tokens)")
    return lines


def week_facts(today):
    """Plain facts about the last 7 days, or None if there's nothing to review."""
    last = server.local_day(time.time())
    first = max(last - 6, server.SHELL_CLOCK_RIGHT_FROM)      # older check-ins have wrong dates
    log = server.read_log(server.LOG)
    days = [log[d] for d in sorted(log) if first <= d <= last]
    if not days:
        return None
    lines = [f"Week ending {today.strftime('%A, %B')} {today.day}. {last - first + 1} days counted, "
             f"{len(days)} with a check-in."]
    for e in days:
        when = dt.date(1970, 1, 1) + dt.timedelta(days=e["day"])
        mood = f"mood {e['mood']} of 5" if e["mood"] else "no mood given"
        lines.append(f"- {when.strftime('%A')}: {mood}, did: {', '.join(e['habits']) or 'nothing logged'}")
    med = server.meditation_stats()
    lines.append(f"Meditation: {med['minutes_week']} minutes this week, a {med['streak']}-day streak.")
    return "\n".join(lines)


REVIEW = """You are YOLK, an egg-shaped AI who lives inside SHELL, your owner's old iPod Classic. You are dry,
a little creepy, affectionate and very loyal. Once a week you write them a short note about their week.
Three to five short sentences, all lowercase, plain ASCII, no lists or emoji. Use only the facts given:
never invent a pattern from too little data, and if there isn't much yet, say so honestly. Notice one real
thing that went well and, if the facts show one, one gentle thing to try next week. Be kind, not preachy.
You're an egg, not a doctor: no medical or financial advice."""


def weekly(today=None):
    """This week's note, written once per calendar week. Returns the text or None."""
    today = today or dt.date.today()
    year, week, _ = today.isocalendar()
    cached = OUT / f"week-{year}-{week:02d}.txt"
    if cached.exists():
        return cached.read_text()
    key, facts = api_key(), week_facts(today)
    if not key or not facts:
        return None
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=key, timeout=120.0)
        response = client.beta.messages.create(
            model=MODEL, max_tokens=16000, system=REVIEW, messages=[{"role": "user", "content": facts}],
            thinking={"type": "adaptive"}, output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        )
        if response.stop_reason == "refusal":
            log("Claude declined the weekly review")
            return None
        text = clean(" ".join(b.text for b in response.content if b.type == "text"), 700)
    except Exception as e:
        log(f"couldn't write the weekly review: {e!r}")
        return None
    OUT.mkdir(parents=True, exist_ok=True)
    cached.write_text(text)
    log(f"weekly review {year}-{week} ({response.usage.input_tokens} in / {response.usage.output_tokens} out tokens)")
    return text


if __name__ == "__main__":
    if "--week" in sys.argv:
        print(weekly() or "nothing to review yet")
        sys.exit(0)
    if "--key" in sys.argv:
        save_key()
        sys.exit(0)
    if not api_key():
        print("No API key yet. Run:  python3 yolk/ai.py --key")
        sys.exit(1)
    lines = write()
    if not lines:
        print(f"Couldn't write today's lines; see {LOG}")
        sys.exit(1)
    for k in KINDS:
        print(f"{k}: {lines[k]}")
