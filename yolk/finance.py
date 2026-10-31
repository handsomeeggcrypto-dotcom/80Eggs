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
    out.write_text(text, encoding="latin-1")
    return True
