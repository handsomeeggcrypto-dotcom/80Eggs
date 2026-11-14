#!/usr/bin/env python3
"""Finance Tracker's numbers, on the Mac and on SHELL.

The tracker page (static/finance.html, http://localhost:8008/finance, this Mac only)
saves to data/finance.json. server.sync() calls deliver(), which writes a summary for
SHELL's Finance app to /YOLK/finance/data.txt whenever something has changed.
The app's wheel code lives in data/finance_code.txt, never in the code.
"""
import datetime as dt
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def clean(s, limit=28):
    s = " ".join(str(s or "?").split()).replace("|", "/")[:limit]
    return s.encode("latin-1", "replace").decode("latin-1")


def payoff(debts, extra, strategy):
    """Same plan as the tracker's: minimums, then extra plus freed-up minimums to the target debt."""
    live = [{"i": i, "bal": num(d.get("balance")), "min": num(d.get("min")), "apr": num(d.get("apr"))}
            for i, d in enumerate(debts) if num(d.get("balance")) > 0]
    paid, months, interest = {}, 0, 0.0
    while any(d["bal"] > .01 for d in live) and months < 600:
        months += 1
        for d in live:
            if d["bal"] > .01:
                charge = d["bal"] * d["apr"] / 100 / 12
                d["bal"] += charge
                interest += charge
        for d in live:
            if d["bal"] > .01:
                d["bal"] -= min(d["min"], d["bal"])
        freed = extra + sum(d["min"] for d in live if d["bal"] <= .01)
        left = [d for d in live if d["bal"] > .01]
        left.sort(key=(lambda d: d["bal"]) if strategy == "snowball" else (lambda d: -d["apr"]))
        for d in left:
            if freed <= 0:
                break
            pay = min(freed, d["bal"])
            d["bal"] -= pay
            freed -= pay
        for d in live:
            if d["bal"] <= .01 and d["i"] not in paid:
                paid[d["i"]] = months
    if any(d["bal"] > .01 for d in live):
        return None, None, paid
    return months, interest, paid


def month_name(months, today=None):
    d = today or dt.date.today()
    m = d.year * 12 + d.month - 1 + months
    return dt.date(m // 12, m % 12 + 1, 1).strftime("%b %Y")


def summary(state, code):
    """Lines for SHELL. Amounts are whole dollars, since SHELL's Lua only does integers."""
    debts = [d for d in state.get("debts", []) if num(d.get("balance")) > 0]
    assets = [a for a in state.get("assets", []) if num(a.get("amount"))]
    income = [a for a in state.get("income", []) if num(a.get("amount"))]
    owed = sum(num(d.get("balance")) for d in debts)
    owned = sum(num(a.get("amount")) for a in assets)
    extra = num(state.get("extra"))
    strategy = state.get("strategy", "avalanche")
    months, interest, paid = payoff(debts, extra, strategy)
    lines = [
        f"code={code}",
        f"networth={round(owned - owed)}",
        f"debt={round(owed)}",
        f"assets={round(owned)}",
        f"income={round(sum(num(a.get('amount')) for a in income))}",
        f"minimums={round(sum(num(d.get('min')) for d in debts))}",
        f"extra={round(extra)}",
        f"plan={strategy}",
        f"free={month_name(months) if months else ('none' if not debts else 'never')}",
        f"months={months or 0}",
        f"interest={round(interest or 0)}",
    ]
    for i, d in enumerate(debts):
        when = month_name(paid[i]) if i in paid else "never"
        lines.append(f"D|{clean(d.get('name'))}|{round(num(d.get('balance')))}|{round(num(d.get('min')))}|{num(d.get('apr')):g}|{when}")
    lines += [f"A|{clean(a.get('name'))}|{round(num(a.get('amount')))}" for a in assets]
    lines += [f"I|{clean(a.get('name'))}|{round(num(a.get('amount')))}" for a in income]
    return "\n".join(lines) + "\n"


# ---------- Payday Planner (same rules as renderPlanner in static/finance.html) ----------
TIGHT = 0.25        # a check with less than a quarter left after bills is "tight"


def _bills(state):
    out = []
    for d in state.get("debts", []):
        if num(d.get("min")) > 0 and num(d.get("balance")) > 0:
            out.append((d.get("name") or "Debt", num(d.get("min")), int(num(d.get("due")))))
    for b in state.get("bills", []):
        if num(b.get("amount")) > 0:
            out.append((b.get("name") or "Bill", num(b.get("amount")), int(num(b.get("day")))))
    return [b for b in out if 1 <= b[2] <= 31]


def _due(year, month, day):
    import calendar
    return dt.date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _between(bills, start, end):
    """(name, amount, due date) for every bill due from start to end, both included."""
    out, y, m = [], start.year, start.month
    while dt.date(y, m, 1) <= end:
        for name, amt, day in bills:
            d = _due(y, m, day)
            if start <= d <= end:
                out.append((name, amt, d))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return sorted(out, key=lambda b: b[2])


def checks(state, today=None, count=3):
    """The paycheck you're on now and the next ones: dicts with date, bills, total, left, pay."""
    pay = state.get("pay") or {}
    try:
        anchor = dt.datetime.strptime(pay.get("date") or "", "%Y-%m-%d").date()
    except ValueError:
        return []
    amount = num(pay.get("amount")) or sum(num(a.get("amount")) for a in state.get("income", [])) * 12 / 26
    c = pay.get("cushion")
    cushion = 2 if c in (None, "") else max(0, int(num(c)))
    today = today or dt.date.today()
    p = anchor + dt.timedelta(days=((today - anchor).days // 14) * 14)
    bills = _bills(state)
    out = []
    for k in range(count):
        start = p + dt.timedelta(days=14 * k)
        due = _between(bills, start + dt.timedelta(days=cushion), start + dt.timedelta(days=13 + cushion))
        total = sum(b[1] for b in due)
        out.append({"date": start, "bills": due, "total": total, "left": amount - total, "pay": amount})
    return out


def payday_warning(today=None, state=None):
    """The day after a payday (or the day after that, if the Mac slept), if this check is fine
    and the next one looks rough: (key, what to tell them). Otherwise None."""
    today = today or dt.date.today()
    if state is None:
        f = HERE / "data" / "finance.json"
        if not f.exists():
            return None
        state = json.loads(f.read_text())
    cs = checks(state, today, 2)
    if len(cs) < 2 or cs[0]["pay"] <= 0:
        return None
    now, nxt = cs
    if (today - now["date"]).days not in (1, 2):
        return None
    rough = nxt["left"] < nxt["pay"] * TIGHT
    if not rough or now["left"] < 0 or now["left"] <= nxt["left"]:
        return None
    hold = max(0.0, nxt["pay"] * TIGHT - nxt["left"])
    biggest = sorted(nxt["bills"], key=lambda b: -b[1])[:3]
    when = nxt["date"].strftime("%A %B %d").replace(" 0", " ")
    what = (f"money heads-up. they got paid {(today - now['date']).days} day(s) ago and this check is fine "
            f"(${round(now['left'])} left after its bills). but the next check, {when}, has to cover "
            f"${round(nxt['total'])} of bills ({', '.join(f'{n} ${round(a)}' for n, a, _ in biggest)}), "
            + (f"which is ${round(-nxt['left'])} MORE than the check. " if nxt["left"] < 0
               else f"leaving only ${round(nxt['left'])}. ")
            + f"tell them to leave about ${int(-(-hold // 10) * 10)} of this check alone so the next one isn't rough. "
            "plain numbers, no lecture, no financial advice beyond that")
    return now["date"].isoformat(), what


def deliver(data_dir, shell_yolk):
    """Writes SHELL's summary if it changed. Returns True if it wrote."""
    src, code_file = data_dir / "finance.json", data_dir / "finance_code.txt"
    if not src.exists():
        return False
    code = code_file.read_text().strip() if code_file.exists() else ""
    text = summary(json.loads(src.read_text()), code)
    out = shell_yolk / "finance" / "data.txt"
    if out.exists() and out.read_text(encoding="latin-1") == text:
        return False
    out.parent.mkdir(exist_ok=True)
    import shellio
    shellio.text(out, text)
    return True
