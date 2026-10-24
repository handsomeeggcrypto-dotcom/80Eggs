#!/usr/bin/env python3
"""Real-AI YOLK: once a day Claude writes, in YOLK's voice, what SHELL finds when she wakes up.

  python3 yolk/ai.py --key      save your Anthropic API key (typed, hidden, kept in yolk/data)
  python3 yolk/ai.py            write (or show) today's lines

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


def clean(s):
    s = " ".join(str(s).split())[:200]
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


if __name__ == "__main__":
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
