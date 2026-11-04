#!/usr/bin/env python3
"""Nest Egg engine: SOL prices, fake wallets, the backtest and the live paper trading.

  python3 nestegg/engine.py backtest   -> how every bot would have done on past prices
  python3 nestegg/engine.py paper      -> one live paper-trading update (server.py runs this every minute)

Prices are Coinbase's hourly SOL-USD candles (free, no key). A real bot would trade SOL/USDC
on Jupiter, which tracks the same price. Everything is fake money: nothing here can trade.
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.request

from bots import BOTS

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
CANDLES = os.path.join(DATA, "candles.json")
PAPER = os.path.join(DATA, "paper.json")
BACKTEST = os.path.join(DATA, "backtest.json")

FEE = 0.001          # 0.1% per trade: Jupiter swap + slippage + network fee, on the safe side
CASH_APY = 0.04      # dollars a bot isn't using sit in USDC lending at about 4% a year
HOURLY_INTEREST = (1 + CASH_APY) ** (1 / 8760) - 1
START_CASH = 1000.0
HISTORY_DAYS = 1300  # first 200 are warm-up for the averages, the rest is the test
WARMUP_DAYS = 200
HOUR = 3600


# ---------- prices ----------

def fetch(start, end):
    """Hourly candles from Coinbase as [[time, close], ...], oldest first. At most 300 per call."""
    url = ("https://api.exchange.coinbase.com/products/SOL-USD/candles?granularity=3600&start=%s&end=%s"
           % (iso(start), iso(end)))
    req = urllib.request.Request(url, headers={"User-Agent": "nestegg"})
    with urllib.request.urlopen(req, timeout=15) as r:
        rows = json.load(r)
    return sorted([int(c[0]), float(c[4])] for c in rows)


def iso(t):
    return dt.datetime.utcfromtimestamp(t).strftime("%Y-%m-%dT%H:%M:%SZ")


def load(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(path, obj):
    os.makedirs(DATA, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    os.replace(tmp, path)


def update_candles():
    """Bring data/candles.json up to the last finished hour. Returns the whole list."""
    candles = load(CANDLES, [])
    done = int(time.time()) // HOUR * HOUR - HOUR      # newest candle that has closed
    t = candles[-1][0] + HOUR if candles else done - HISTORY_DAYS * 24 * HOUR
    added = False
    while t <= done:
        end = min(t + 299 * HOUR, done)
        new = [c for c in fetch(t, end) if t <= c[0] <= done]
        if candles:
            new = [c for c in new if c[0] > candles[-1][0]]
        candles += new
        added = added or bool(new)
        t = end + HOUR
        time.sleep(0.2)
    if added:
        save(CANDLES, candles)
    return candles


# ---------- market + wallets ----------

class Market:
    """What the bots can see: the latest hourly close, and the list of daily closes so far."""

    def __init__(self):
        self.t = self.price = None
        self.daily = []
        self.day_close = False

    def feed(self, c):
        self.t, self.price = c
        self.day_close = (self.t // HOUR) % 24 == 23    # the 23:00-24:00 UTC candle ends the day
        if self.day_close:
            self.daily.append(self.price)


def wallet():
    return {"cash": START_CASH, "sol": 0.0, "cost": 0.0, "state": {}, "trades": [], "wins": 0, "losses": 0}


def step(bot, m, w):
    w["cash"] *= 1 + HOURLY_INTEREST
    want = bot.decide(m, w)
    if want is None:
        return
    p = m.price
    diff = want - w["sol"]
    eq = w["cash"] + w["sol"] * p
    if abs(diff * p) < max(1.0, eq * 0.005):
        return
    if diff > 0:
        usd = min(diff * p, w["cash"] / (1 + FEE))
        if usd < 1:
            return
        qty = usd / p
        w["cost"] = (w["cost"] * w["sol"] + usd * (1 + FEE)) / (w["sol"] + qty)   # average price paid per SOL
        w["cash"] -= usd * (1 + FEE)
        w["sol"] += qty
        w["trades"].append([m.t, "buy", round(p, 3), round(usd, 2)])
    else:
        qty = min(-diff, w["sol"])
        usd = qty * p
        profit = usd * (1 - FEE) - qty * w["cost"]
        w["wins" if profit > 0 else "losses"] += 1
        w["sol"] -= qty
        w["cash"] += usd * (1 - FEE)
        if w["sol"] * p < 0.01:
            w["sol"] = 0.0
        w["trades"].append([m.t, "sell", round(p, 3), round(usd, 2), round(profit, 2)])


# ---------- scoring ----------

def stats(curve):
    """curve = [[time, equity], ...] daily. Returns the numbers the page shows."""
    eqs = [e for _, e in curve]
    peak, worst = eqs[0], 0.0
    for e in eqs:
        peak = max(peak, e)
        worst = min(worst, e / peak - 1)
    months, years = {}, {}
    for t, e in curve:
        d = dt.datetime.utcfromtimestamp(t)
        months.setdefault(d.strftime("%Y-%m"), [e, e])[1] = e
        years.setdefault(str(d.year), [e, e])[1] = e
    # each period runs from the previous period's last value
    def returns(periods):
        out, prev = {}, eqs[0]
        for k in sorted(periods):
            out[k] = periods[k][1] / prev - 1
            prev = periods[k][1]
        return out
    mret = returns(months)
    return {
        "final": eqs[-1],
        "total": eqs[-1] / eqs[0] - 1,
        "worstDrop": worst,
        "upMonths": sum(1 for r in mret.values() if r > 0.001),
        "flatMonths": sum(1 for r in mret.values() if abs(r) <= 0.001),
        "months": len(mret),
        "monthly": mret,
        "yearly": returns(years),
    }


def summary(bot, w, curve):
    s = stats(curve)
    s.update({"id": bot.id, "name": bot.name, "icon": bot.icon, "blurb": bot.blurb, "source": bot.source,
              "trades": len(w["trades"]), "wins": w["wins"], "losses": w["losses"],
              "sol": w["sol"], "cash": w["cash"], "recent": w["trades"][-25:]})
    return s


# ---------- backtest ----------

def backtest(candles):
    m = Market()
    start = candles[0][0] + WARMUP_DAYS * 24 * HOUR
    wallets = {b.id: wallet() for b in BOTS}
    curves = {b.id: [] for b in BOTS}
    price = []
    for c in candles:
        m.feed(c)
        if c[0] < start:
            continue
        for b in BOTS:
            step(b, m, wallets[b.id])
        if m.day_close:
            price.append([c[0], c[1]])
            for b in BOTS:
                w = wallets[b.id]
                curves[b.id].append([c[0], round(w["cash"] + w["sol"] * c[1], 2)])
    return {
        "made": int(time.time()), "from": price[0][0], "to": price[-1][0], "fee": FEE, "cashApy": CASH_APY, "startCash": START_CASH,
        "price": price,
        "bots": [dict(summary(b, wallets[b.id], curves[b.id]), curve=curves[b.id]) for b in BOTS],
    }


# ---------- live paper trading ----------

def paper(candles):
    """Feed every finished hour to the bots. They start with $1,000 of fake money the first time this runs."""
    st = load(PAPER, None)
    if st is None:
        st = {"started": candles[-1][0], "last": candles[-1][0],
              "wallets": {b.id: wallet() for b in BOTS}, "curves": {b.id: [] for b in BOTS}}
    for b in BOTS:     # a bot added later starts fresh
        st["wallets"].setdefault(b.id, wallet())
        st["curves"].setdefault(b.id, [])
    m = Market()
    for c in candles:
        m.feed(c)
        if c[0] <= st["last"]:
            continue
        for b in BOTS:
            w = st["wallets"][b.id]
            step(b, m, w)
            st["curves"][b.id].append([c[0], round(w["cash"] + w["sol"] * c[1], 2)])
        st["last"] = c[0]
    save(PAPER, st)
    return st


def paper_report(st, candles):
    p = candles[-1][1]
    out = {"started": st["started"], "last": st["last"], "price": p,
           "priceAtStart": next((c[1] for c in candles if c[0] == st["started"]), p), "bots": []}
    for b in BOTS:
        curve = st["curves"][b.id] or [[st["started"], START_CASH]]
        s = summary(b, st["wallets"][b.id], [[st["started"], START_CASH]] + curve)
        out["bots"].append(dict(s, curve=curve[-24 * 90:]))
    return out


def main():
    candles = update_candles()
    if sys.argv[1:] == ["backtest"]:
        r = backtest(candles)
        save(BACKTEST, r)
        print("%s to %s, $%d each, %.1f%% fee per trade, %d%% a year on idle dollars" % (
            iso(r["from"])[:10], iso(r["to"])[:10], START_CASH, FEE * 100, CASH_APY * 100))
        years = sorted(r["bots"][0]["yearly"])
        print("%-14s %9s %8s %9s %9s %7s  %s" % ("bot", "final", "total", "worst", "up mo", "trades", "  ".join(years)))
        for b in r["bots"]:
            print("%-14s %9.0f %7.0f%% %8.0f%% %5d/%-3d %7d  %s" % (
                b["name"], b["final"], b["total"] * 100, b["worstDrop"] * 100, b["upMonths"], b["months"], b["trades"],
                "  ".join("%+5.0f%%" % (b["yearly"][y] * 100) for y in years)))
    else:
        st = paper(candles)
        print(json.dumps({b: round(st["curves"][b][-1][1], 2) if st["curves"][b] else START_CASH for b in st["curves"]}))


if __name__ == "__main__":
    main()
