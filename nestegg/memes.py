#!/usr/bin/env python3
"""Nest Egg memecoin bots: paper trading Solana memecoins with real prices and real slippage.

  python3 nestegg/memes.py    -> one scan + one price check, printed (server.py runs this all day)

Two bots share the same feed of trending coins from Jupiter:
  Safe Scout      runs every rug check below before it buys
  No-Rules Randy  buys anything trending up. He's the control: he shows what the checks are worth
Both use the same exits: take half at +25%, stop at -20%, sell everything after 4 hours.

Every buy and sell is priced with a real Jupiter quote for that exact amount, so thin coins
cost what they'd really cost. On top of that each swap pays 1% extra slippage and a $0.20
network fee. Fake money only: nothing here signs or sends a transaction.
"""
import calendar
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "data", "memes.json")

JUP = "https://lite-api.jup.ag"
RUGCHECK = "https://api.rugcheck.xyz/v1/tokens/%s/report"
USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
LISTS = ["toptrending/5m", "toptrending/1h", "toporganicscore/1h"]

START = 1000.0
SIZE = 0.05          # each trade uses 5% of the bot's money
MAX_OPEN = 5
TAKE_HALF = 0.25     # sell half at +25%, then the rest can't lose: it sells if it falls back to even
TRAIL = 0.15         # ...or 15% below its best price
STOP = -0.20
MAX_HOURS = 4
RUG_DROP = 0.40      # liquidity down 40% since we bought = someone is pulling it
EXTRA_SLIP = 0.01
TX_FEE = 0.20
SCAN_EVERY = 120
COOLDOWN = 24 * 3600  # never buy the same coin twice in a day

BOTS = [
    {"id": "scout", "name": "Safe Scout", "icon": "🔍", "safe": True,
     "blurb": "Only buys a trending coin after it passes 11 rug checks: no mint or freeze switch, no whales, no serial-launcher dev, real buyers, RugCheck clean, and a test sell that works."},
    {"id": "randy", "name": "No-Rules Randy", "icon": "🎰", "safe": False,
     "blurb": "Buys whatever's trending up, no questions asked. Same exits as Scout. He's here to show what the rug checks are actually worth."},
]


# ---------- data ----------

last_call = {}


def get(url, timeout=12):
    """GET JSON, at most about one call a second per site (Jupiter's free limit), retrying once if told to slow down."""
    host = urllib.parse.urlparse(url).netloc
    for attempt in (0, 1):
        wait = last_call.get(host, 0) + 1.1 - time.time()
        if wait > 0:
            time.sleep(wait)
        last_call[host] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": "nestegg", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt:
                raise
            time.sleep(5)


def tokens(mints):
    """Jupiter's info for up to 100 coins: price, liquidity, holders, audit, 1h stats."""
    out = {}
    mints = list(mints)
    for i in range(0, len(mints), 100):
        for t in get(JUP + "/tokens/v2/search?query=" + ",".join(mints[i:i + 100])):
            out[t["id"]] = t
    return out


def quote(src, dst, raw):
    """What Jupiter would really give for `raw` units of src. None if there's no way to swap it."""
    q = urllib.parse.urlencode({"inputMint": src, "outputMint": dst, "amount": int(raw), "slippageBps": 500})
    try:
        r = get(JUP + "/swap/v1/quote?" + q)
    except Exception:
        return None
    return int(r["outAmount"]) if r.get("outAmount") else None


def age_hours(t):
    try:
        made = calendar.timegm(time.strptime(t["createdAt"][:19], "%Y-%m-%dT%H:%M:%S"))
    except (KeyError, TypeError, ValueError):
        return 0
    return (time.time() - made) / 3600


# ---------- the checks ----------

def momentum(t):
    """Both bots: it has to be going up now, but not already a rocket."""
    h = t.get("stats1h") or {}
    ch = h.get("priceChange") or 0
    if (t.get("liquidity") or 0) < 10000:
        return "almost no liquidity"
    if ch < 5:
        return "not rising (%+.0f%% this hour)" % ch
    if ch > 100:
        return "already pumped %+.0f%% this hour" % ch
    if (h.get("buyVolume") or 0) <= (h.get("sellVolume") or 0):
        return "more selling than buying"
    return None


def safety(t):
    """Scout only: the cheap checks, all from Jupiter's token info."""
    a = t.get("audit") or {}
    if a.get("mintAuthorityDisabled") is not True:
        return "dev can still print more coins"
    if a.get("freezeAuthorityDisabled") is not True:
        return "dev can freeze your coins"
    if (a.get("topHoldersPercentage") or 100) > 25:
        return "top 10 wallets hold %.0f%%" % (a.get("topHoldersPercentage") or 100)
    if (a.get("devMints") or 0) > 20:
        return "dev has launched %d coins" % a["devMints"]
    if (t.get("liquidity") or 0) < 50000:
        return "liquidity under $50k"
    if not 250000 <= (t.get("mcap") or 0) <= 50e6:
        return "market cap outside $250k-$50M"
    if age_hours(t) < 2:
        return "less than 2 hours old"
    if (t.get("holderCount") or 0) < 1000:
        return "under 1,000 holders"
    if (t.get("organicScore") or 0) < 50:
        return "mostly bot trading (organic score %.0f)" % (t.get("organicScore") or 0)
    return None


def rugcheck(mint):
    try:
        r = get(RUGCHECK % mint, timeout=20)
    except Exception:
        return "RugCheck didn't answer"
    if r.get("rugged"):
        return "RugCheck says it already rugged"
    bad = [x["name"] for x in r.get("risks") or [] if x.get("level") == "danger"]
    return "RugCheck: " + ", ".join(bad[:2]).lower() if bad else None


# ---------- wallets ----------

def new_state():
    return {"started": int(time.time()), "lastScan": 0, "checked": [], "reasons": {},
            "bots": {b["id"]: {"cash": START, "open": [], "closed": [], "seen": {}, "curve": []} for b in BOTS}}


def load():
    try:
        with open(STATE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return new_state()


def save(st):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with open(STATE + ".tmp", "w") as f:
        json.dump(st, f, separators=(",", ":"))
    os.replace(STATE + ".tmp", STATE)


def value(w):
    return w["cash"] + sum(p["qty"] * p["price"] for p in w["open"])


def buy(w, t, usd):
    raw = quote(USDC, t["id"], usd * 1e6)
    if not raw:
        return "Jupiter has no way to buy it"
    qty = raw / 10 ** t["decimals"] * (1 - EXTRA_SLIP)
    w["cash"] -= usd + TX_FEE
    w["open"].append({"mint": t["id"], "symbol": t["symbol"], "icon": t.get("icon"), "dec": t["decimals"],
                      "qty": qty, "spent": usd + TX_FEE, "entry": (usd + TX_FEE) / qty, "price": t["usdPrice"],
                      "peak": t["usdPrice"], "liq0": t.get("liquidity") or 0, "liq": t.get("liquidity") or 0,
                      "opened": int(time.time()), "half": False, "back": 0.0, "stuck": 0})
    w["seen"][t["id"]] = int(time.time())
    return None


def sell(w, p, part, why):
    """Sell `part` (0.5 or 1) of a position at a real Jupiter quote. False if it can't be sold right now."""
    qty = p["qty"] * part
    raw = quote(p["mint"], USDC, qty * 10 ** p["dec"])
    if raw is None:
        p["stuck"] += 1
        return False
    got = max(0.0, raw / 1e6 * (1 - EXTRA_SLIP) - TX_FEE)
    w["cash"] += got
    p["back"] += got
    p["qty"] -= qty
    if part == 1:
        close(w, p, why)
    return True


def close(w, p, why):
    w["open"].remove(p)
    w["closed"].append({"symbol": p["symbol"], "mint": p["mint"], "icon": p.get("icon"), "opened": p["opened"],
                        "closedAt": int(time.time()), "spent": round(p["spent"], 2), "back": round(p["back"], 2),
                        "profit": round(p["back"] - p["spent"], 2), "why": why})
    w["closed"] = w["closed"][-200:]


# ---------- the loop ----------

def watch(st):
    """Check every open position against the exit rules. Runs every 30 seconds."""
    held = {p["mint"] for w in st["bots"].values() for p in w["open"]}
    info = tokens(held) if held else {}
    now = time.time()
    for w in st["bots"].values():
        for p in list(w["open"]):
            t = info.get(p["mint"])
            if t and t.get("usdPrice"):
                p["price"], p["liq"] = t["usdPrice"], t.get("liquidity") or 0
                p["peak"] = max(p["peak"], p["price"])
            gain = p["price"] / p["entry"] - 1
            hours = (now - p["opened"]) / 3600
            if p["stuck"] > 20 and hours > MAX_HOURS + 1:      # tried for an hour after time ran out
                p["price"] = 0
                close(w, p, "couldn't sell it: no buyers left (rugged)")
            elif p["liq0"] and p["liq"] < p["liq0"] * (1 - RUG_DROP):
                sell(w, p, 1, "liquidity pulled, ran")
            elif gain <= STOP:
                sell(w, p, 1, "stop loss")
            elif not p["half"] and gain >= TAKE_HALF:
                if sell(w, p, 0.5, ""):
                    p["half"] = True
            elif p["half"] and gain <= 0:
                sell(w, p, 1, "took half, rest fell back to even")
            elif p["half"] and p["price"] <= p["peak"] * (1 - TRAIL):
                sell(w, p, 1, "took half, then trailing stop")
            elif hours >= MAX_HOURS:
                sell(w, p, 1, "4 hours up")
        curve = w["curve"]
        if not curve or now - curve[-1][0] >= 600:
            curve.append([int(now), round(value(w), 2)])


def note(st, t, verdict):
    st["checked"].append({"t": int(time.time()), "symbol": t.get("symbol", "?"), "mint": t["id"],
                          "icon": t.get("icon"), "ok": verdict is None, "why": verdict or "passed every check"})
    st["checked"] = st["checked"][-60:]
    if verdict:
        key = verdict.split(" (")[0]
        key = "top 10 wallets hold too much" if key.startswith("top 10") else \
              "dev launched too many coins" if key.startswith("dev has launched") else \
              "already pumped" if key.startswith("already pumped") else \
              "RugCheck danger" if key.startswith("RugCheck:") else key
        st["reasons"][key] = st["reasons"].get(key, 0) + 1


def scan(st):
    seen, feed = set(), []
    for path in LISTS:
        for t in get(JUP + "/tokens/v2/" + path + "?limit=50"):
            if t["id"] not in seen and t["id"] != USDC and not t["id"].startswith("So111"):
                seen.add(t["id"])
                feed.append(t)
    now = time.time()
    for b in BOTS:
        w = st["bots"][b["id"]]
        if len(w["open"]) >= MAX_OPEN:
            continue
        busy = {p["mint"] for p in w["open"]} | {m for m, ts in w["seen"].items() if now - ts < COOLDOWN}
        tries = 0
        for t in feed:
            if t["id"] in busy or not t.get("usdPrice") or not t.get("decimals"):
                continue
            if momentum(t):                 # not moving right now: neither bot looks twice
                continue
            if b["safe"]:
                why = safety(t)
                if why is None:
                    if tries >= 3:          # RugCheck + test sell are slow; 3 finalists per scan is plenty
                        break
                    tries += 1
                    why = rugcheck(t["id"]) or test_sell(t, value(w) * SIZE)
                note(st, t, why)
                if why:
                    continue
            if buy(w, t, value(w) * SIZE) is None:
                break
        w["seen"] = {m: ts for m, ts in w["seen"].items() if now - ts < COOLDOWN}
    st["lastScan"] = int(now)


def test_sell(t, usd):
    """Buy and sell straight back, on paper. Catches honeypots, hidden taxes and thin pools."""
    raw = quote(USDC, t["id"], usd * 1e6)
    back = quote(t["id"], USDC, raw) if raw else None
    if not back:
        return "test sell failed: can't sell it"
    loss = 1 - back / (usd * 1e6)
    return "test sell loses %.0f%% (hidden tax or thin pool)" % (loss * 100) if loss > 0.05 else None


def tick(st):
    watch(st)
    if time.time() - st["lastScan"] >= SCAN_EVERY:
        scan(st)
    save(st)


def report(st):
    out = {"started": st["started"], "lastScan": st["lastScan"], "checked": st["checked"][::-1],
           "reasons": sorted(st["reasons"].items(), key=lambda kv: -kv[1]), "rules": {
               "size": SIZE, "maxOpen": MAX_OPEN, "takeHalf": TAKE_HALF, "trail": TRAIL, "stop": STOP,
               "maxHours": MAX_HOURS, "slip": EXTRA_SLIP, "fee": TX_FEE}, "bots": []}
    for b in BOTS:
        w = st["bots"][b["id"]]
        c = w["closed"]
        wins = [x for x in c if x["profit"] > 0]
        out["bots"].append(dict(b, value=value(w), cash=w["cash"], curve=w["curve"][-1000:], trades=len(c),
                                wins=len(wins), rugs=sum(1 for x in c if "rug" in x["why"] or "liquidity" in x["why"]),
                                avgWin=sum(x["profit"] for x in wins) / len(wins) if wins else 0,
                                avgLoss=sum(x["profit"] for x in c if x["profit"] <= 0) / max(1, len(c) - len(wins)),
                                open=[dict(p, gain=p["price"] / p["entry"] - 1, now=p["qty"] * p["price"] + p["back"])
                                      for p in w["open"]],
                                closed=c[-40:][::-1]))
    return out


if __name__ == "__main__":
    s = load()
    s["lastScan"] = 0
    tick(s)
    r = report(s)
    for b in r["bots"]:
        print("%s %s: $%.2f, %d open %s" % (b["icon"], b["name"], b["value"], len(b["open"]),
                                          [(p["symbol"], round(p["spent"], 2)) for p in b["open"]]))
    for c in r["checked"][:15]:
        print("  %-12s %s" % (c["symbol"][:12], c["why"]))
