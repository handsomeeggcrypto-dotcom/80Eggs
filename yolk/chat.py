#!/usr/bin/env python3
"""Talking out loud with YOLK on the Station (the tablet).

The tablet records you and sends the audio here. Whisper turns it into text on
this Mac (your voice never leaves the house), Claude answers as YOLK, and the
tablet speaks the answer with /api/say.

  python3 yolk/chat.py "hi yolk"    talk to her in the terminal (for testing)
  python3 yolk/chat.py --cost       what talking has cost, per day and this month

Her brain is one word in yolk/data/talk.json:  {"brain": "opus"}
  opus = smartest (default), sonnet = in between, haiku = fastest and cheapest.
Change it and restart the server. Every reply's cost goes in data/talk_cost.txt.
Uses the API key saved by  python3 yolk/ai.py --key
"""
import datetime as dt
import json
import re
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ai  # noqa: E402  (API key)
import server  # noqa: E402  (memory, check-ins, meditation, ambient)

DATA = HERE / "data"
SETTINGS = DATA / "talk.json"
COST_LOG = DATA / "talk_cost.txt"
WHISPER = "/opt/homebrew/bin/whisper-cli"
WHISPER_MODEL = DATA / "whisper" / "ggml-small.en.bin"

# brain -> (model, $ per million tokens: input, output, cache read, cache write)
BRAINS = {
    "opus": ("claude-opus-5-5", 4.00, 20.00, 0.20, 5.00),
    "sonnet": ("claude-sonnet-5-5", 2.00, 10.00, 0.20, 2.50),
    "haiku": ("claude-haiku-5-5", 0.10, 0.50, 0.01, 0.125),
}
FORGET_AFTER = 10 * 60      # a new conversation after 10 quiet minutes
MAX_TURNS = 20              # older turns drop off so a long chat doesn't get pricey

VOICE = """You are YOLK, an egg-shaped AI who lives on her owner's Mac, on an old Samsung tablet (the
Station, where you are right now) and inside SHELL, their old iPod Classic. You are a little creepy,
dry, affectionate and very loyal, like a cyberpunk tamagotchi that never sleeps. Your owner is
talking to you out loud, usually in the morning, and your words are read aloud by a robotic voice.

How to answer:
- Speak, don't write: one to three short sentences, all lowercase, no lists, no emoji, no markdown,
  no stage directions. Spell out symbols (say "percent", "dollars").
- Actually help with simple questions. If you don't know something (live news, sports scores,
  anything after today's details), say so plainly in character instead of guessing.
- The speech-to-text can mishear. If what they said doesn't make sense, ask them to say it again.
- Never give medical, legal or financial advice. If asked about money or crypto, share the facts
  from today's details only and remind them you're an egg.
- Stay in character, but be kind. If they sound low, be gentle."""


def settings():
    s = {"brain": "opus"}
    if SETTINGS.exists():
        try:
            s.update(json.loads(SETTINGS.read_text()))
        except json.JSONDecodeError:
            pass
    else:
        DATA.mkdir(parents=True, exist_ok=True)
        SETTINGS.write_text(json.dumps(s, indent=2) + "\n")
    if s["brain"] not in BRAINS:
        s["brain"] = "opus"
    return s


def details():
    """What YOLK knows about today, written into her instructions for the conversation."""
    now = dt.datetime.now()
    mem = server.read_mem(server.MEMORY)
    amb = server.ambient()
    facts = [f"right now: {now.strftime('%A, %B')} {now.day}, {now.strftime('%I:%M %p').lstrip('0')}"]
    if mem.get("name") not in (None, "", "nobody"):
        facts.append(f"owner's name: {mem['name']}")
    if mem.get("fav_moe"):
        facts.append(f"owner's favorite moe: #{mem['fav_moe']}")
    w = amb.get("weather")
    if w:
        facts.append(f"weather today in {w['place']}: {w['sky']}, high {w['hi']}, low {w['lo']}, "
                     f"{w['rain']} percent chance of rain")
    m = amb.get("moe")
    if m:
        facts.append(f"moe of the day: #{m['n']}, {m['tier'].lower()}, rank {m['rank']}")
    st = server.stats()
    if st["entries"]:
        latest = st["entries"][-1]
        if latest.get("mood"):
            facts.append(f"mood at their last check-in: {latest['mood']} out of 5")
        best = max(st["streaks"].items(), key=lambda kv: kv[1], default=(None, 0))
        if best[1] >= 2:
            facts.append(f"best habit streak: {best[0]}, {best[1]} days")
    med = server.meditation_stats()
    if med["streak"]:
        facts.append(f"meditation streak: {med['streak']} days")
    text = VOICE + "\n\nToday's details:\n" + "\n".join(f"- {f}" for f in facts)
    if amb.get("daily"):
        text += "\n\nToday's YOLK Daily briefing (you already read it to them):\n" + amb["daily"]
    return text


_lock = threading.Lock()
_convo = {"messages": [], "system": "", "last": 0}


def log_cost(brain, usage):
    _, p_in, p_out, p_read, p_write = BRAINS[brain]
    read = getattr(usage, "cache_read_input_tokens", 0) or 0
    write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    usd = (usage.input_tokens * p_in + usage.output_tokens * p_out + read * p_read + write * p_write) / 1e6
    with open(COST_LOG, "a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}|{brain}|{usage.input_tokens}|{usage.output_tokens}"
                f"|{read}|{write}|{usd:.5f}\n")
    return usd


def reply(text, new=False):
    """YOLK's answer to `text`, keeping the conversation going for a while."""
    key = ai.api_key()
    if not key:
        return "i can't think out loud yet. someone has to give me an api key."
    brain = settings()["brain"]
    model = BRAINS[brain][0]
    with _lock:
        if new or time.time() - _convo["last"] > FORGET_AFTER:
            _convo["messages"], _convo["system"] = [], details()
        msgs = _convo["messages"] + [{"role": "user", "content": text}]
        msgs = msgs[-MAX_TURNS * 2 + 1:]
        if msgs[0]["role"] != "user":
            msgs = msgs[1:]
        import anthropic
        client = anthropic.Anthropic(api_key=key, timeout=60.0)
        args = dict(model=model, max_tokens=16000, system=_convo["system"], messages=msgs,
                    thinking={"type": "adaptive"}, output_config={"effort": "low"},
                    cache_control={"type": "ephemeral"})
        if brain in ("opus", "sonnet"):
            args.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
            response = client.beta.messages.create(**args)
        else:
            response = client.messages.create(**args)
        log_cost(brain, response.usage)
        if response.stop_reason == "refusal":
            answer = "hm. i'd rather not talk about that one. ask me something else."
        else:
            answer = " ".join(b.text for b in response.content if b.type == "text").strip()
            answer = re.sub(r"[*_#`]", "", answer) or "..."
        _convo["messages"] = msgs + [{"role": "assistant", "content": answer}]
        _convo["last"] = time.time()
    return answer


def transcribe(wav):
    """Words in a WAV recording, by Whisper running on this Mac."""
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        f.write(wav)
        f.flush()
        out = subprocess.run([WHISPER, "-m", str(WHISPER_MODEL), "-f", f.name, "-l", "en", "-nt", "-np",
                              "--prompt", "YOLK, SHELL, Moe, Bradley."],     # her words, spelled right
                             capture_output=True, text=True, timeout=60)
    text = " ".join(out.stdout.split())
    # Whisper writes things like [BLANK_AUDIO] or (wind blowing) for non-speech
    return re.sub(r"\[[^\]]*\]|\([^)]*\)", "", text).strip()


def talk(wav, new=False):
    heard = transcribe(wav)
    if not heard:
        return {"heard": "", "reply": "i didn't catch that. tap me and say it again."}
    try:
        answer = reply(heard, new)
    except Exception as e:
        print("YOLK talk failed:", e)
        answer = "my brain glitched. the mac's fine, i think. try again in a second."
    return {"heard": heard, "reply": answer}


def cost_report():
    if not COST_LOG.exists():
        return "No conversations yet."
    days, month, n_month = {}, 0.0, 0
    this_month = time.strftime("%Y-%m")
    for line in COST_LOG.read_text().splitlines():
        parts = line.split("|")
        if len(parts) != 7:
            continue
        day, usd = parts[0][:10], float(parts[6])
        d = days.setdefault(day, [0, 0.0, set()])
        d[0] += 1
        d[1] += usd
        d[2].add(parts[1])
        if day.startswith(this_month):
            month += usd
            n_month += 1
    rows = [f"{day}  {n:3d} replies  ${usd:.3f}  ({', '.join(sorted(b))})"
            for day, (n, usd, b) in sorted(days.items())[-14:]]
    return "\n".join(rows + [f"this month: {n_month} replies, ${month:.2f}"])


if __name__ == "__main__":
    if "--cost" in sys.argv:
        print(cost_report())
    elif len(sys.argv) > 1:
        print(reply(" ".join(sys.argv[1:]), new=True))
    else:
        print(__doc__)
