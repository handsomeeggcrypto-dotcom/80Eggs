#!/usr/bin/env python3
"""YOLK's morning text: weather, reminders, her dream and oracle, streaks, crypto. Sent by iMessage.

  python3 yolk/morning.py              show this morning's text (sends nothing)
  python3 yolk/morning.py --install    text every morning at "text_at" (data/daily.json)
  python3 yolk/morning.py --uninstall  stop the morning texts
  python3 yolk/morning.py --test       send one now (even if today's already went out)

Settings in data/daily.json (personal, not in git): "text_to" = the phone number or iMessage
email to send to, "text_at" = "HH:MM". The sending is done by a tiny invisible app,
~/Applications/YOLK Morning.app, because macOS only lets an app control Messages: it asks
"YOLK Morning wants to control Messages" once. Log: data/morning.log
"""
import datetime as dt
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import daily  # noqa: E402
import server  # noqa: E402

DATA = HERE / "data"
LOG = DATA / "morning.log"
SENT = DATA / "morning_sent.txt"        # the day the last text went out
LABEL = "com.80eggs.yolk.morning"
PLIST = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
APP = Path.home() / "Applications" / "YOLK Morning.app"
LATEST = 11                             # if the Mac slept through 7am, still text until 11:59, not after


def log(msg):
    DATA.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {msg}\n")


def weather(cfg, day):
    w = daily.weather_data(cfg.get("city"), day)
    if not w:
        return None
    line = f"{w['hi']}° / {w['lo']}°, {w['sky']}"
    if w["rain"] >= 30:
        line += f", {w['rain']}% rain" + (". bring something." if w["rain"] >= 60 else "")
    if w["lo"] <= 32:
        line += ". freezing tonight."
    return line


def reminders(day):
    """Reminders still waiting, plus the ones last night's YOLK Daily already read out for today."""
    items = daily.take_reminders()
    f = daily.OUT / "reminders.json"
    if f.exists():
        saved = json.loads(f.read_text())
        if saved.get("day") == day.isoformat():
            items = saved["items"] + [r for r in items if r not in saved["items"]]
    return items


def crypto(cfg):
    p = daily.prices()
    if not p:
        return None
    arrow = lambda ch: "→" if abs(ch) < 0.5 else ("↑" if ch > 0 else "↓") + f"{abs(ch):.0f}%"
    return "  ".join(f"{daily.COINS[k][1]} ${usd:,.0f} {arrow(ch)}" for k, (usd, ch) in p.items())


def compose(day=None):
    day = day or dt.date.today()
    cfg = daily.config()
    mem = server.read_mem(server.MEMORY)
    name = "" if mem.get("name") in (None, "", "nobody") else f", {mem['name']}"
    lines = [f"🥚 YOLK · {day.strftime('%A, %b')} {day.day}", f"good morning{name}."]

    w = weather(cfg, day)
    if w:
        lines.append(f"🌤 {w}")
    rem = reminders(day)
    if rem:
        lines.append("you told me to remind you:")
        lines += [f"• {r}" for r in rem]

    m = daily.moe_of_the_day(day)
    mind = daily.ai.write(day, extras=[x for x in (w, m) if x])
    if mind:
        lines.append("")
        if mind.get("dream"):
            lines.append(f"last night i dreamed {mind['dream'][0].lower()}{mind['dream'][1:]}"
                         if not mind["dream"].lower().startswith(("i ", "last night")) else mind["dream"])
        if mind.get("oracle"):
            lines.append(f"🔮 {mind['oracle']}")

    streaks = []
    st = server.stats()
    best = max(st["streaks"].items(), key=lambda kv: kv[1], default=(None, 0))
    if best[1] >= 2:
        streaks.append(f"{best[0]} {best[1]} days")
    med = server.meditation_stats()
    if med["streak"] >= 2:
        streaks.append(f"meditation {med['streak']} days")
    if streaks:
        lines.append("")
        lines.append("streaks: " + ", ".join(streaks) + ". don't break them. i'll know.")

    c = crypto(cfg)
    if c:
        lines.append(f"📈 {c}")
    if mind and mind.get("daily"):
        lines += ["", mind["daily"]]
    return "\n".join(lines)


def next_text(force=False):
    """(who, text) to send now, or None if it already went out today or it's too late in the day."""
    cfg = daily.config()
    who = cfg.get("text_to")
    today = dt.date.today()
    if not who:
        log("no text_to in data/daily.json; nothing sent")
        return None
    if not force:
        if SENT.exists() and SENT.read_text().strip() == today.isoformat():
            return None
        if dt.datetime.now().hour > LATEST:
            log("Mac was asleep all morning; skipped today's text")
            return None
    return who, compose(today)


# ---------- the sender app + daily timer ----------

APPLESCRIPT = """on run argv
  set py to "{py} {script}"
  set extra to ""
  try
    if argv contains "--force" then set extra to " --force"
  end try
  try
    set out to do shell script py & " --next" & extra without altering line endings
  on error
    return
  end try
  if out is "" then return
  set AppleScript's text item delimiters to linefeed
  set who to paragraph 1 of out
  set msg to (paragraphs 2 thru -1 of out) as text
  try
    tell application "Messages"
      set svc to 1st account whose service type = iMessage
      send msg to participant who of svc
    end tell
    do shell script py & " --sent"
  on error e
    do shell script py & " --failed " & quoted form of e
  end try
end run
"""


def build_app():
    script = APPLESCRIPT.format(py=shlex.quote(sys.executable), script=shlex.quote(str(Path(__file__).resolve())))
    shutil.rmtree(APP, ignore_errors=True)
    APP.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["osacompile", "-o", str(APP), "-e", script], check=True)
    info = APP / "Contents" / "Info.plist"
    subprocess.run(["plutil", "-replace", "LSUIElement", "-bool", "true", str(info)], check=True)  # no Dock icon
    subprocess.run(["plutil", "-replace", "CFBundleIdentifier", "-string", LABEL, str(info)], check=True)
    subprocess.run(["codesign", "--force", "--sign", "-", str(APP)], check=True)


def plist_text(hour, minute):
    out = DATA / "morning.out"
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-g</string>
    <string>-j</string>
    <string>{APP}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>{hour}</integer><key>Minute</key><integer>{minute}</integer></dict>
  <key>StandardOutPath</key><string>{out}</string>
  <key>StandardErrorPath</key><string>{out}</string>
</dict>
</plist>
"""


def install():
    hour, minute = (int(x) for x in daily.config().get("text_at", "07:00").split(":"))
    uninstall(quiet=True)
    build_app()
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    PLIST.write_text(plist_text(hour, minute))
    subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(PLIST)], check=True)
    log(f"installed: texts every day at {hour:02d}:{minute:02d}")
    print(f"Installed. YOLK will text you every morning at {hour:02d}:{minute:02d}.\nLog: {LOG}")


def uninstall(quiet=False):
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{LABEL}"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if PLIST.exists():
        PLIST.unlink()
    shutil.rmtree(APP, ignore_errors=True)
    if not quiet:
        log("uninstalled")
        print("Uninstalled. No more morning texts.")


def test():
    """Sends one right now through the installed app, so the Messages permission is granted
    to the same app the 7am timer uses (it would otherwise ask while you're asleep)."""
    if not APP.exists():
        install()
    subprocess.run(["open", "-W", str(APP), "--args", "--force"])
    print(LOG.read_text().splitlines()[-1] if LOG.exists() else "nothing logged")


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--install" in args:
        install()
    elif "--uninstall" in args:
        uninstall()
    elif "--test" in args:
        test()
    elif "--next" in args:                  # used by the app: prints "who\ntext", or nothing
        nxt = next_text(force="--force" in args)
        if nxt:
            sys.stdout.write(f"{nxt[0]}\n{nxt[1]}")
    elif "--sent" in args:
        SENT.write_text(dt.date.today().isoformat())
        log("sent this morning's text")
    elif "--failed" in args:
        log(f"Messages couldn't send: {' '.join(args[1:])}")
    else:
        print(compose())
