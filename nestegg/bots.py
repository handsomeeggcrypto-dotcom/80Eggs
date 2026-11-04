"""The Nest Egg bots. Each one looks at SOL's price and says how much SOL it wants to hold.

A bot's decide(m, w) gets the Market (price + daily closes) and its wallet, and returns
how many SOL it wants to own, or None for "leave it alone". The engine does the actual
buying and selling, with fees, so the backtest and the live paper trading run the same code.
Anything a bot needs to remember goes in w["state"], which is saved between runs.

Rules are textbook settings from where each idea comes from, not tuned to SOL's past.
"""
import math


def sma(xs, n):
    return sum(xs[-n:]) / n if len(xs) >= n else None


def rsi(xs, n, look=60):
    """Wilder's RSI over the last `look` closes."""
    xs = xs[-look:]
    if len(xs) <= n:
        return None
    d = [b - a for a, b in zip(xs, xs[1:])]
    up = sum(max(x, 0) for x in d[:n]) / n
    dn = sum(max(-x, 0) for x in d[:n]) / n
    for x in d[n:]:
        up = (up * (n - 1) + max(x, 0)) / n
        dn = (dn * (n - 1) + max(-x, 0)) / n
    return 100.0 if dn == 0 else 100 - 100 / (1 + up / dn)


def vol(xs, n):
    """Yearly volatility from the last n daily moves (0.8 = SOL typically swings 80% a year)."""
    if len(xs) <= n:
        return None
    r = [math.log(b / a) for a, b in zip(xs[-n - 1:], xs[-n:])]
    m = sum(r) / n
    return math.sqrt(sum((x - m) ** 2 for x in r) / (n - 1)) * math.sqrt(365)


def equity(m, w):
    return w["cash"] + w["sol"] * m.price


def all_in(m, w):
    return equity(m, w) / m.price


class Hold:
    id, name, icon = "hold", "Just Hold", "🪨"
    blurb = "Buys SOL on day one and never sells. Not really a bot: it's the score to beat."
    source = "Benchmark"

    def decide(self, m, w):
        return all_in(m, w) if w["cash"] > 1 else None


class Savings:
    id, name, icon = "savings", "Savings", "🏦"
    blurb = "Never buys SOL. Keeps the dollars as USDC earning interest. The 'small profits that compound' baseline: any bot should beat this to be worth the risk."
    source = "USDC lending (Kamino, MarginFi and others pay roughly 3-8% a year, but it isn't guaranteed)"

    def decide(self, m, w):
        return None


class Trend:
    id, name, icon = "trend", "Trend Rider", "🏄"
    blurb = "Once a day: if SOL is above its 50-day average it holds SOL, otherwise it sits in dollars. Skips most of the big crashes."
    source = "Trend following (moving-average rule). The oldest rule with the longest track record across stocks, commodities and crypto"

    def decide(self, m, w):
        if not m.day_close:
            return None
        s = sma(m.daily, 50)
        if s is None:
            return None
        return all_in(m, w) if m.price > s else 0


class Steady:
    id, name, icon = "steady", "Steady Eddie", "🐢"
    blurb = "Trend Rider, but it only bets part of the money: less when SOL is swinging wildly, more when it's calm. Smaller wins, much smaller losses."
    source = "Trend following + volatility targeting (Moreira & Muir 2017). How most professional trend funds size their bets"
    TARGET = 0.40   # aim for a 40% yearly swing instead of SOL's ~80-100%

    def decide(self, m, w):
        if not m.day_close:
            return None
        s, v = sma(m.daily, 50), vol(m.daily, 30)
        if s is None or v is None:
            return None
        f = min(1.0, self.TARGET / v) if m.price > s else 0.0
        eq = equity(m, w)
        now = w["sol"] * m.price / eq
        if abs(f - now) < 0.10 and not (f == 0 and now > 0):   # don't pay fees for tiny nudges
            return None
        return f * eq / m.price


class Dip:
    id, name, icon = "dip", "Dip Diver", "🤿"
    blurb = "Only in an uptrend (above the 200-day average): buys after a sharp 1-2 day drop, sells as soon as price bounces back above its 5-day average. Lots of small wins."
    source = "Larry Connors' RSI(2) pullback rule. Famous for winning 70%+ of trades on stock indexes"

    def decide(self, m, w):
        if not m.day_close:
            return None
        st = w["state"]
        s200, s5, r = sma(m.daily, 200), sma(m.daily, 5), rsi(m.daily, 2)
        if s200 is None:
            return None
        if w["sol"] > 0:
            st["days"] = st.get("days", 0) + 1
            if m.price > s5 or st["days"] >= 10:
                return 0
            return None
        if m.price > s200 and r < 10:
            st["days"] = 0
            return all_in(m, w)
        return None


class Ladder:
    id, name, icon = "ladder", "Grid Ladder", "🪜"
    blurb = "Splits the money into 10 slices. Buys a slice every time SOL drops 2%, sells each slice at +2%. The classic 'small profits' bot. Watch what happens when SOL keeps falling."
    source = "Grid / DCA bots, the most popular kind on Pionex, Binance and 3Commas"
    STEP, SLICES = 0.02, 10

    def decide(self, m, w):
        st, p = w["state"], m.price
        lots = st.get("lots", [])
        keep = [l for l in lots if p < l[0] * (1 + self.STEP)]   # sell slices that are up 2%
        if not keep:
            st["slice"] = equity(m, w) / self.SLICES   # fresh ladder, sized to today's money so wins compound
        low = min(l[0] for l in keep) if keep else None
        if len(keep) < self.SLICES and (low is None or p <= low * (1 - self.STEP)):
            keep.append([p, min(st["slice"], w["cash"] + sum(l[1] for l in lots if l not in keep) * p) / p])
        if keep == lots:
            return None
        st["lots"] = keep
        return sum(l[1] for l in keep)


BOTS = [Savings(), Hold(), Trend(), Steady(), Dip(), Ladder()]
