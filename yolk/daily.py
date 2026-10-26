#!/usr/bin/env python3
"""YOLK Daily: a short spoken morning briefing that lands on SHELL as a song.

  python3 yolk/daily.py            build today's briefing (or tomorrow's, after 5pm)
                                   and copy it to SHELL if she's plugged in
  python3 yolk/daily.py --print    just print the script, no audio

Settings live in yolk/data/daily.json (made on first run):
  {"city": "Nashville", "voice": "Junior", "rate": 175}
Weather comes from open-meteo.com and crypto prices from CoinGecko (both free, no account).
Optional wallets, by public address only (read-only balance lookups; a Solana
wallet's other tokens are counted too, priced by Jupiter):
  "wallets": {"solana": "<address>", "ethereum": "0x...", "bitcoin": "bc1..."} Reminders left on the
desktop terminal ("remind me tomorrow") are read out once, then cleared. With an API key
(python3 yolk/ai.py --key), YOLK writes her own sign-off and leaves SHELL a dream, a
secret and an oracle answer each day (see ai.py).
"""
import datetime as dt
import json
import random
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CONFIG = DATA / "daily.json"
REMINDERS = DATA / "reminders.txt"
OUT = DATA / "daily"                     # latest briefing: .txt + .m4a
SHELL = Path("/Volumes/SHELL")

sys.path.insert(0, str(HERE))
import server  # noqa: E402  (memory + Moe lookups)
import ai  # noqa: E402  (real-AI YOLK; does nothing without an API key)

DEFAULTS = {"city": "", "voice": "Junior", "rate": 175}

WEATHER_CODES = {
    0: "clear skies", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy", 45: "foggy", 48: "foggy",
    51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "rain showers", 81: "rain showers", 82: "violent rain showers", 85: "snow showers", 86: "snow showers",
    95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with hail",
}


def config():
    DATA.mkdir(parents=True, exist_ok=True)
    if not CONFIG.exists():
        CONFIG.write_text(json.dumps(DEFAULTS, indent=2))
    return {**DEFAULTS, **json.loads(CONFIG.read_text())}


def get_json(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())


def weather_data(city, day):
    """{"place", "sky", "hi", "lo", "rain"} for `day`, or None."""
    if not city:
        return None
    try:
        # "Town, State": search the town, then prefer the result in that state/region
        town, _, region = (part.strip() for part in city.partition(","))
        geo = get_json("https://geocoding-api.open-meteo.com/v1/search?count=10&name=" + urllib.parse.quote(town))
        results = geo["results"]
        place = next((r for r in results if region and region.lower() in
                      (r.get("admin1", "") + " " + r.get("country", "")).lower()), results[0])
        q = urllib.parse.urlencode({
            "latitude": place["latitude"], "longitude": place["longitude"], "timezone": "auto",
            "temperature_unit": "fahrenheit", "forecast_days": 3,
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        })
        d = get_json("https://api.open-meteo.com/v1/forecast?" + q)["daily"]
        i = d["time"].index(day.isoformat())
    except Exception:
        return None
    return {"place": place["name"], "sky": WEATHER_CODES.get(d["weather_code"][i], "weather"),
            "hi": round(d["temperature_2m_max"][i]), "lo": round(d["temperature_2m_min"][i]),
            "rain": d["precipitation_probability_max"][i] or 0}


def weather(city, day):
    """One spoken sentence about `day`'s weather, or None."""
    w = weather_data(city, day)
    if not w:
        return None
    hi, lo, rain, sky = w["hi"], w["lo"], w["rain"], w["sky"]
    line = f"Weather in {w['place']}: {sky}, a high of {hi} and a low of {lo}."
    if rain >= 60:
        line += f" {rain} percent chance of rain. Bring something. I can't come with you, I'm an egg."
    elif rain >= 30:
        line += f" {rain} percent chance of rain. Maybe."
    if hi >= 90:
        line += " It's going to be hot. Eggs cook at that temperature. Just saying."
    elif lo <= 32:
        line += " Freezing tonight. Keep SHELL in your pocket. She gets cold."
    return line


COINS = {"bitcoin": ("Bitcoin", "BTC"), "ethereum": ("Ethereum", "ETH"), "solana": ("Solana", "SOL")}


def prices():
    """{"bitcoin": (usd, change_24h_percent), ...} from CoinGecko (free, no account), or {}."""
    try:
        q = urllib.parse.urlencode({"ids": ",".join(COINS), "vs_currencies": "usd", "include_24hr_change": "true"})
        d = get_json("https://api.coingecko.com/api/v3/simple/price?" + q)
        return {k: (v["usd"], v.get("usd_24h_change") or 0) for k, v in d.items() if k in COINS}
    except Exception:
        return {}


def post_json(url, payload):
    req = urllib.request.Request(url, json.dumps(payload).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def balance(coin, address):
    """Coins held at a public address (read-only lookups, no account), or None."""
    try:
        if coin == "solana":
            r = post_json(SOLANA_RPC, {"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": [address]})
            return r["result"]["value"] / 1e9
        if coin == "ethereum":
            r = post_json("https://eth.drpc.org",
                          {"jsonrpc": "2.0", "id": 1, "method": "eth_getBalance", "params": [address, "latest"]})
            return int(r["result"], 16) / 1e18
        if coin == "bitcoin":
            s = get_json("https://mempool.space/api/address/" + urllib.parse.quote(address))["chain_stats"]
            return (s["funded_txo_sum"] - s["spent_txo_sum"]) / 1e8
    except Exception:
        return None


SOLANA_RPC = "https://api.mainnet-beta.solana.com"
TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]


def jupiter(path):
    req = urllib.request.Request("https://lite-api.jup.ag/" + path, headers={"User-Agent": "yolk"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def solana_tokens(address):
    """[(symbol, usd), ...] for the other tokens in a Solana wallet, priced by Jupiter (free, no account)."""
    held = {}
    try:
        for prog in TOKEN_PROGRAMS:
            r = post_json(SOLANA_RPC, {"jsonrpc": "2.0", "id": 1, "method": "getTokenAccountsByOwner",
                                       "params": [address, {"programId": prog}, {"encoding": "jsonParsed"}]})
            for acct in r["result"]["value"]:
                info = acct["account"]["data"]["parsed"]["info"]
                amount = float(info["tokenAmount"]["uiAmountString"])
                if amount > 0:
                    held[info["mint"]] = held.get(info["mint"], 0) + amount
        ids = ",".join(list(held)[:50])
        price = jupiter("price/v3?ids=" + ids)
        names = {t["id"]: t.get("symbol") or "a mystery token" for t in jupiter("tokens/v2/search?query=" + ids)}
    except Exception:
        return []
    return [(names.get(m, "a mystery token"), amount * ((price.get(m) or {}).get("usdPrice") or 0))
            for m, amount in held.items()]


def dollars(x):
    return f"{x:,.0f} dollars" if x >= 100 else f"{x:,.2f} dollars"


def crypto(cfg):
    """Spoken lines: today's prices, then what the wallets in daily.json are worth."""
    p = prices()
    if not p:
        return []
    parts = []
    for k, (usd, ch) in p.items():
        move = "flat" if abs(ch) < 0.5 else f"{'up' if ch > 0 else 'down'} {abs(ch):.0f} percent"
        parts.append(f"{COINS[k][0]} {dollars(usd)}, {move}")
    lines = ["Crypto: " + ". ".join(parts) + "."]
    held = []                           # (name, usd)
    for k, addr in (cfg.get("wallets") or {}).items():
        amount = balance(k, addr) if addr and k in p else None
        if amount is not None:
            held.append((COINS[k][1], amount * p[k][0]))
        if addr and k == "solana":
            held += solana_tokens(addr)
    held = sorted((h for h in held if h[1] >= 1), key=lambda h: -h[1])   # skip dust and airdrop junk
    if held:
        top = ", ".join(f"{name} {dollars(usd)}" for name, usd in held[:3])
        lines.append(f"Your wallet is worth about {dollars(sum(usd for _, usd in held))}. Biggest: {top}. "
                     "I don't give financial advice. I'm an egg.")
    return lines


def moe_of_the_day(day):
    n = random.Random(day.toordinal()).randint(1, 5250)
    m = server.moe(n)
    if not m:
        return None
    t = m["traits"][0] if m["traits"] else None
    line = f"Moe of the day: number {n}. {m['tier'].lower()}, rank {m['rank']}."
    if t:
        line += f" Its rarest thing is {t['type']}: {t['value'].replace('*', '').strip()}."
    return line


def take_reminders():
    if not REMINDERS.exists():
        return []
    items = [l.strip() for l in REMINDERS.read_text(encoding="utf-8").splitlines() if l.strip()]
    return items


def script(day, cfg):
    mem = server.read_mem(server.MEMORY)
    name = mem.get("name", "")
    who = "" if name in ("", "nobody") else f", {name}"
    rnd = random.Random(day.toordinal() * 7)
    opener = rnd.choice([
        f"Good morning{who}. This is YOLK Daily. I've been up all night. I'm always up all night.",
        f"Morning{who}. YOLK here. Coming to you live from inside the shell.",
        f"Wake up{who}. It's YOLK. This is your daily transmission.",
    ])
    lines = [opener, f"Today is {day.strftime('%A, %B')} {day.day}."]
    w = weather(cfg["city"], day)
    if w:
        lines.append(w)
    lines += crypto(cfg)
    rem = take_reminders()
    if rem:
        lines.append("You told me to remind you:" if len(rem) > 1 else "You told me to remind you of something.")
        lines += [f"{r.rstrip('.')}." for r in rem]
    st = server.stats()
    if st["entries"]:
        best = max(st["streaks"].items(), key=lambda kv: kv[1], default=(None, 0))
        if best[1] >= 2:
            lines.append(f"Streak report: {best[0]}, {best[1]} days in a row. Don't break it. I'll know.")
        latest = st["entries"][-1]
        if latest.get("mood") and latest["mood"] <= 2:
            lines.append("Last check-in you said it was a rough one. New day. I'm rooting for you.")
    med = server.meditation_stats()
    if med["streak"] >= 2:
        lines.append(f"You've meditated {med['streak']} days in a row. I sit with you. Quietly. For an egg.")
    m = moe_of_the_day(day)
    if m:
        lines.append(m)
    mind = ai.write(day, extras=[x for x in (w, m) if x])
    lines.append(mind["daily"] if mind else rnd.choice([
        "That's it. Go do things. I'll be in your pocket, judging.",
        "End of transmission. Hit next when you're ready. I'll wait. I always wait.",
        "That's the day. Be nice to yourself. Or don't. I'm an egg, not a cop.",
    ]))
    return lines, rem


def speak(text, voice, rate, out_m4a):
    with tempfile.TemporaryDirectory() as tmp:
        aiff = Path(tmp) / "daily.aiff"
        subprocess.run(["say", "-v", voice, "-r", str(rate), "-o", str(aiff), text], check=True)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", str(aiff), str(out_m4a)], check=True)


def target_day(now=None):
    now = now or dt.datetime.now()
    # made in the evening (SHELL charging overnight) = tomorrow's briefing
    return (now + dt.timedelta(days=1)).date() if now.hour >= 17 else now.date()


def build(print_only=False):
    cfg = config()
    day = target_day()
    lines, rem = script(day, cfg)
    text = "\n".join(lines)
    if print_only:
        return text, None, day
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "daily.txt").write_text(text, encoding="utf-8")
    speak(" ".join(lines), cfg["voice"], cfg["rate"], OUT / "YOLK Daily.m4a")
    (OUT / "day.txt").write_text(day.isoformat())
    if rem:
        REMINDERS.write_text("")          # read out once
    return text, OUT / "YOLK Daily.m4a", day


MEDITATION = HERE / "static" / "sounds" / "med"     # tools/make_meditation_audio.py
SESSIONS = HERE / "static" / "sounds" / "sessions"  # tools/make_meditation_sessions.py


def deliver_meditation():
    """Puts the binaural / noise tracks on SHELL as a Meditation album, and the ready-made
    bell-to-bell sessions MEDITATE plays in Meditation Sessions (only missing ones)."""
    if not (SHELL / "YOLK").is_dir():
        return 0
    copied = 0
    for src, album in [(MEDITATION, "Meditation"), (SESSIONS, "Meditation Sessions")]:
        if not src.is_dir():
            continue
        dest = SHELL / "Music" / album
        dest.mkdir(parents=True, exist_ok=True)
        for track in sorted(src.glob("*.m4a")):
            target = dest / track.name
            if not target.exists() or target.stat().st_size != track.stat().st_size:
                shutil.copyfile(track, target)
                copied += 1
    return copied


def deliver():
    """Copies the latest briefing onto SHELL. Returns True if it was copied."""
    deliver_meditation()
    if not (SHELL / "YOLK").is_dir() or not (OUT / "YOLK Daily.m4a").exists():
        return False
    music = SHELL / "Music" / "YOLK Daily"
    music.mkdir(parents=True, exist_ok=True)
    (music / "YOLK Daily.m4a").write_bytes((OUT / "YOLK Daily.m4a").read_bytes())
    # also as text, so Talk to YOLK can read it out on screen
    text = (OUT / "daily.txt").read_text(encoding="utf-8")
    (SHELL / "YOLK" / "daily.txt").write_text(text.encode("latin-1", "replace").decode("latin-1"), encoding="latin-1")
    deliver_ai()
    return True


def deliver_ai():
    """Hands the AI-written dream, secret and oracle for the briefing's day to SHELL, once."""
    day = (OUT / "day.txt").read_text().strip() if (OUT / "day.txt").exists() else ""
    written = ai.OUT / f"{day}.json"
    marker = ai.OUT / "delivered.txt"
    if not day or not written.exists() or (marker.exists() and marker.read_text().strip() == day):
        return False
    mind = json.loads(written.read_text())
    with open(SHELL / "YOLK" / "dreams.txt", "a", encoding="latin-1", errors="replace") as f:
        for kind in ("dream", "secret", "oracle"):
            if mind.get(kind):
                f.write(f"{kind}: {mind[kind]}\n")
    marker.write_text(day)
    return True


def needs_build():
    f = OUT / "day.txt"
    return not f.exists() or f.read_text().strip() != target_day().isoformat()


if __name__ == "__main__":
    if "--print" in sys.argv:
        print(build(print_only=True)[0])
        sys.exit(0)
    text, path, day = build()
    print(f"YOLK Daily for {day}:\n{text}\n\naudio: {path}")
    print("copied to SHELL" if deliver() else "SHELL not plugged in; will copy next time")
