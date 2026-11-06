#!/usr/bin/env python3
"""YOLK keeps an eye on Nest Egg, the practice crypto bots (~/80Eggs/nestegg, always running).

  python3 yolk/eggwatch.py     what she sees right now

Reads Nest Egg's own page data (http://127.0.0.1:8121/api/data, this Mac only) and
turns it into a few plain facts: how the two memecoin bots (Safe Scout and No-Rules
Randy) are doing against their pretend $1,000, the last day, the best and worst
recent trade, and whether any SOL bot is beating Savings. It's all pretend money,
and she only reports it; she never gives advice.
Used by chat.details (a line in her instructions), morning.py (one line in the
morning text) and nudge.py (a text when Scout has a big day).
"""
import json
import sys
import time
import urllib.request

URL = "http://127.0.0.1:8121/api/data"
START = 1000.0
BIG_DAY = 0.10          # Scout moving 10 percent in a day is worth a text


def fetch():
    try:
        return json.loads(urllib.request.urlopen(URL, timeout=4).read())
    except Exception:
        return None


def value_ago(curve, seconds):
    """The bot's value about `seconds` ago, from its curve of [unix, value]."""
    cutoff = time.time() - seconds
    before = [v for t, v in curve if t <= cutoff]
    return before[-1] if before else (curve[0][1] if curve else START)


def summary(data=None):
    """Plain facts, or None if Nest Egg isn't running."""
    data = data or fetch()
    if not data or not data.get("memes"):
        return None
    out = {"bots": [], "since": data["memes"].get("started")}
    for b in data["memes"]["bots"]:
        closed = sorted(b.get("closed", []), key=lambda c: c.get("closedAt", 0))
        day = [c for c in closed if c.get("closedAt", 0) > time.time() - 86400]
        out["bots"].append({
            "id": b["id"], "name": b["name"], "value": b["value"],
            "total": b["value"] / START - 1,
            "day": b["value"] / value_ago(b.get("curve", []), 86400) - 1,
            "high": max([v for _, v in b.get("curve", [])] + [START]),
            "trades": b["trades"], "wins": b["wins"], "rugs": b.get("rugs", 0),
            "open": [o["symbol"] for o in b.get("open", [])],
            "best_day": max(day, key=lambda c: c["profit"], default=None),
            "worst_day": min(day, key=lambda c: c["profit"], default=None),
        })
    paper = (data.get("paper") or {}).get("bots", [])
    savings = next((b["final"] for b in paper if b["id"] == "savings"), None)
    ahead = [b for b in paper if savings is not None and b["id"] != "savings" and b["final"] > savings + 1]
    out["sol_ahead"] = [(b["name"], b["final"]) for b in sorted(ahead, key=lambda b: -b["final"])]
    out["savings"] = savings
    return out


def money(x):
    return f"${x:,.0f}"


def pct(x):
    return f"{'+' if x >= 0 else '-'}{abs(x) * 100:.0f}%"


def for_chat():
    """A line for her instructions in chats, or None."""
    s = summary()
    if not s:
        return None
    parts = []
    for b in s["bots"]:
        line = (f"{b['name']} has {money(b['value'])} of its pretend $1,000 ({pct(b['total'])} overall, "
                f"{pct(b['day'])} in the last day; {b['wins']} wins in {b['trades']} trades, {b['rugs']} rugs)")
        if b["best_day"] and b["best_day"]["profit"] > 0:
            line += f", best trade today {b['best_day']['symbol']} +{money(b['best_day']['profit'])}"
        parts.append(line)
    if s["sol_ahead"]:
        parts.append(f"SOL bot beating Savings: {s['sol_ahead'][0][0]} at {money(s['sol_ahead'][0][1])}")
    elif s["savings"]:
        parts.append("no SOL bot is beating plain Savings yet")
    return ("Nest Egg, their practice crypto bots (pretend money, no wallet, they can't trade; "
            "they're practicing for the day they try real money. report it, never advise): " + "; ".join(parts))


def for_morning():
    """One short line for the morning text, or None."""
    s = summary()
    if not s:
        return None
    return "🪺 nest egg: " + ", ".join(f"{b['name'].split()[-1].lower()} {money(b['value'])} ({pct(b['day'])} today)"
                                       for b in s["bots"])


def nudge_reason():
    """(key, what) when Scout had a big day or a new high, else None."""
    s = summary()
    if not s:
        return None
    scout = next((b for b in s["bots"] if b["id"] == "scout"), None)
    if not scout:
        return None
    today = time.strftime("%Y-%m-%d")
    if abs(scout["day"]) >= BIG_DAY:
        word = "up" if scout["day"] > 0 else "down"
        return (f"{today}-{word}",
                f"Safe Scout, their practice memecoin bot, is {word} {pct(abs(scout['day']))[1:]} in the last day, "
                f"now {money(scout['value'])} of its pretend $1,000. it's pretend money; report it, don't advise")
    if scout["value"] > START and scout["value"] >= scout["high"] - 0.01:
        return (f"high-{int(scout['value'])}",
                f"Safe Scout, their practice memecoin bot, just hit a new high: {money(scout['value'])} "
                "of its pretend $1,000. it's pretend money; report it, don't advise")
    return None


if __name__ == "__main__":
    s = summary()
    if not s:
        print("Nest Egg isn't answering on :8121.")
        sys.exit(1)
    print(for_chat())
    print()
    print(for_morning())
    print("\nworth a text?", nudge_reason() or "no")
