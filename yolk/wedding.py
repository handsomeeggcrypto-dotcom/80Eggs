#!/usr/bin/env python3
"""The wedding countdown. The date is personal, so it lives in data/daily.json
("wedding": "yyyy-mm-dd", gitignored), never in code.

  python3 yolk/wedding.py      days to go, and the next milestone

She uses it in four places:
  - every chat knows how many days are left (chat.details)
  - the morning text gets a line (morning.py)
  - the Station's clock screen shows it under the streaks (/api/ambient)
  - on milestone days (MILESTONES) she texts about it once (nudge.py, urgent so it gets through)
After the day it quietly stops, except the morning of, which says so.
"""
import datetime as dt
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

MILESTONES = {365, 300, 250, 200, 150, 100, 75, 50, 30, 21, 14, 7, 3, 2, 1, 0}


def day():
    import daily
    try:
        return dt.date.fromisoformat(str(daily.config().get("wedding", "")))
    except ValueError:
        return None


def days_left(today=None):
    d = day()
    if not d:
        return None
    return (d - (today or dt.date.today())).days


def for_chat():
    n = days_left()
    if n is None or n < 0:
        return None
    if n == 0:
        return "TODAY is their wedding day."
    return (f"their wedding is {day().strftime('%B')} {day().day}, {day().year}: {n} day{'s' if n != 1 else ''} away. "
            "bring it up now and then, warmly, not every time")


def for_morning():
    n = days_left()
    if n is None or n < 0:
        return None
    if n == 0:
        return "💍 today. you're getting married today."
    return f"💍 {n} day{'s' if n != 1 else ''} to the wedding"


def short():
    """For the Station's clock screen."""
    n = days_left()
    if n is None or n < 0:
        return None
    return "wedding: today" if n == 0 else f"wedding: {n} day{'s' if n != 1 else ''}"


def nudge_reason():
    """(key, what) on a milestone day, else None."""
    n = days_left()
    if n is None or n not in MILESTONES:
        return None
    what = ("it's their wedding day today. one short, warm text, a little strange, very proud"
            if n == 0 else
            f"their wedding is {n} day{'s' if n != 1 else ''} away (a milestone: you count every one)")
    return f"{day().isoformat()}-{n}", what


if __name__ == "__main__":
    n = days_left()
    if n is None:
        print('no wedding date. add "wedding": "yyyy-mm-dd" to yolk/data/daily.json')
    else:
        nxt = max([m for m in MILESTONES if m <= n], default=None)
        print(for_morning() or "the wedding has passed.")
        if nxt is not None:
            print(f"next milestone text: {nxt} days to go, on {day() - dt.timedelta(days=nxt)}")
