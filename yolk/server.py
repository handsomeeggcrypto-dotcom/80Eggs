#!/usr/bin/env python3
"""YOLK's home on the Mac: serves the desktop terminal and syncs with SHELL.

  python3 yolk/server.py        -> http://localhost:8008

YOLK Station (the tablet) reaches it over home Wi-Fi at http://<mac's address>:8008.
Anything not on this Mac must pair first with the code in data/station.json
(printed at startup, and shown by the desktop terminal's "pair a tablet").

Memory lives in yolk/data/memory.txt (same key=value format as SHELL's
/YOLK/memory.txt). Whenever SHELL is plugged in, the two memories are merged
(see merge), her journal's newest notes go to /YOLK/remember.txt, and any
dreams left for SHELL are written to its /YOLK/dreams.txt.
Listens on the home network so the tablet can connect; other devices get only
the pairing page until they enter the code.
"""
import hashlib
import json
import os
import secrets
import re
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATIC = HERE / "static"
DATA = Path(os.environ.get("YOLK_DATA", HERE / "data"))  # personal; not in git
MEMORY = DATA / "memory.txt"
QUEUE = DATA / "dreams_queue.txt"
SENT = DATA / "dreams_sent.txt"

SHELL = Path(os.environ.get("YOLK_SHELL", "/Volumes/SHELL/YOLK"))  # override for testing
MOEKADEX = Path.home() / "80Eggs" / "shell" / "root" / "YOLK" / "moekadex"
MOE_PHOTOS = Path.home() / "80Eggs" / "moekedex" / "ipod_photos"

PORT = 8008
STATION = DATA / "station.json"     # pairing code + the token paired devices hold
TTS = DATA / "tts"                  # cached voice clips for the tablet


def station_config():
    """Pairing code and device token, made on first run."""
    DATA.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(STATION.read_text()) if STATION.exists() else {}
    changed = False
    if "code" not in cfg:
        cfg["code"] = f"{secrets.randbelow(1000000):06d}"
        cfg["token"] = secrets.token_hex(16)
        changed = True
    if "watch_key" not in cfg:          # the Apple Watch Shortcut sends this instead of a cookie
        cfg["watch_key"] = secrets.token_hex(16)
        changed = True
    if changed:
        # only when something's new, and all at once: every tablet request reads this file,
        # and rewriting it each time let a request catch it half-written (and fail)
        tmp = STATION.with_suffix(".tmp")
        tmp.write_text(json.dumps(cfg, indent=2))
        tmp.replace(STATION)
    return cfg


def lan_address():
    for iface in ("en0", "en1", "en2", "en3", "en4", "en5", "en6", "en7", "en8"):
        try:
            a = subprocess.run(["ipconfig", "getifaddr", iface], capture_output=True, text=True, timeout=2).stdout.strip()
            if a:
                return a
        except Exception:
            pass
    return None


_bad_codes = {"n": 0, "until": 0}


# ------------------------------------------------------------------ memory
def read_mem(path):
    mem = {}
    if path.exists():
        for line in path.read_text(encoding="latin-1").splitlines():
            m = re.match(r"^([\w]+)=(.*)$", line)
            if m:
                mem[m.group(1)] = m.group(2)
    return mem


def write_mem(path, mem):
    path.parent.mkdir(parents=True, exist_ok=True)
    # latin-1 because SHELL's font (and Lua) only handle single-byte text
    text = "".join(f"{k}={v}\n" for k, v in sorted(mem.items()))
    import shellio
    shellio.text(path, text)


def stamp(mem):
    return int(mem.get("last_seen", 0) or 0)


COUNTERS = ("visits", "desk_visits", "affection", "dreams_seen")


MERGED = DATA / "memory_synced.txt"   # what both sides agreed on at the last sync


def merge(desk, shell, base=None):
    """Combines the Mac's and SHELL's memories so neither side's changes get lost.

    `base` is what both had after the last sync. A key changed on only one side
    takes that side's value; changed on both, the side used most recently wins.
    Counters add up what each side added since then. With no base (the first
    sync), the most recent side wins and counters take the higher number."""
    newer, older = (shell, desk) if stamp(shell) > stamp(desk) else (desk, shell)
    if base is None:
        out = dict(older)
        out.update(newer)
        for k in COUNTERS:
            vals = [int(m[k]) for m in (desk, shell) if str(m.get(k, "")).isdigit()]
            if vals:
                out[k] = str(max(vals))
        return out
    out = {}
    for k in set(desk) | set(shell):
        d, s, b = desk.get(k), shell.get(k), base.get(k)
        if k in COUNTERS:
            n = lambda v: int(v) if str(v or "").isdigit() else 0
            out[k] = str(max(n(b) + (n(d) - n(b)) + (n(s) - n(b)), n(d), n(s)))
        elif k == "last_seen":
            out[k] = str(max(stamp(desk), stamp(shell)))
        elif d == s or s == b:
            out[k] = d if d is not None else s
        elif d == b:
            out[k] = s if s is not None else d
        else:
            out[k] = newer.get(k, older.get(k))
    return {k: v for k, v in out.items() if v is not None}


# ------------------------------------------------------------------ check-ins
# One line per day: "day|time|mood|habit,habit". `day` comes from SHELL's own
# clock (unix time / 86400), so it only matches the calendar once that's set.
LOG = DATA / "log.txt"
HABITS = DATA / "habits.txt"
DEFAULT_HABITS = ["water", "walk", "meditate", "draw", "sleep"]


def read_log(path):
    entries = {}
    if path.exists():
        for line in path.read_text(encoding="latin-1").splitlines():
            m = re.match(r"^(\d+)\|(\d+)\|(\d)\|(.*)$", line)
            if m:
                d, t, mood, h = int(m[1]), int(m[2]), int(m[3]), [x for x in m[4].split(",") if x]
                if d not in entries or t >= entries[d]["time"]:
                    entries[d] = {"day": d, "time": t, "mood": mood, "habits": h}
    return entries


def write_log(path, entries):
    path.parent.mkdir(parents=True, exist_ok=True)
    import shellio
    shellio.text(path, "".join(f"{e['day']}|{e['time']}|{e['mood']}|{','.join(sorted(e['habits']))}\n"
                               for _, e in sorted(entries.items())))


def habits():
    if HABITS.exists():
        h = [l.strip() for l in HABITS.read_text(encoding="utf-8").splitlines() if l.strip()]
        if h:
            return h
    return DEFAULT_HABITS


def streak(entries, habit, last_day):
    """Consecutive days ending at the latest check-in (or the one before it)."""
    d = last_day if habit in entries.get(last_day, {}).get("habits", []) else last_day - 1
    n = 0
    while habit in entries.get(d, {}).get("habits", []):
        n += 1
        d -= 1
    return n


def stats():
    entries = read_log(LOG)
    if not entries:
        return {"habits": habits(), "entries": [], "streaks": {}, "mood_avg": None}
    last = max(entries)
    recent = [entries.get(d) for d in range(last - 6, last + 1)]
    moods = [e["mood"] for e in recent if e and e["mood"] > 0]    # 0 = logged a meditation, no mood yet
    return {
        "habits": habits(),
        "entries": [e or {"day": last - 6 + i, "mood": None, "habits": []} for i, e in enumerate(recent)],
        "streaks": {h: streak(entries, h, last) for h in habits()},
        "mood_avg": round(sum(moods) / len(moods), 1) if moods else None,
        "total": len(entries),
    }


# ------------------------------------------------------------------ meditation
# Sessions from the Station: "unixtime|minutes". SHELL keeps its own in /YOLK/med/sessions.txt
# ("day|time|minutes", the length picked, logged when a session starts), copied here on
# sync. They only count from the day its clock was set: before that its day numbers
# don't match real days.
MEDITATIONS = DATA / "meditations.txt"
SHELL_MEDITATIONS = DATA / "shell_meditations.txt"
SHELL_CLOCK_RIGHT_FROM = 20757      # 2026-10-31


def local_day(t):
    return int(t + time.localtime(t).tm_gmtoff) // 86400


def meditation_stats():
    sessions = []
    if MEDITATIONS.exists():
        for line in MEDITATIONS.read_text().splitlines():
            m = re.match(r"^(\d+)\|(\d+)$", line)
            if m:
                sessions.append((int(m[1]), int(m[2])))
    days = {local_day(t) for t, _ in sessions}
    days |= {d for d, e in read_log(LOG).items() if d >= SHELL_CLOCK_RIGHT_FROM and "meditate" in e["habits"]}
    sessions = [(local_day(t), m) for t, m in sessions]
    if SHELL_MEDITATIONS.exists():
        for line in SHELL_MEDITATIONS.read_text().splitlines():
            m = re.match(r"^(\d+)\|\d+\|(\d+)$", line)
            if m and int(m[1]) >= SHELL_CLOCK_RIGHT_FROM:
                sessions.append((int(m[1]), int(m[2])))
                days.add(int(m[1]))
    today = local_day(time.time())
    d = today if today in days else today - 1          # today not done yet doesn't break it
    streak = 0
    while d in days:
        streak += 1
        d -= 1
    week = sum(mins for d, mins in sessions if d > today - 7)
    return {"streak": streak, "today": today in days, "sessions": len(sessions),
            "minutes_week": week, "minutes_total": sum(m for _, m in sessions)}


def shell_connected():
    return SHELL.is_dir()


_shell_lock = threading.RLock()           # one writer to SHELL at a time
_mount = {"id": None, "announced": False}


_trip = {}                                # what this plug-in took from SHELL and left on it


def trip(way, what, n):
    if n:
        _trip.setdefault(way, {})
        _trip[way][what] = _trip[way].get(what, 0) + n


def read_quiet(path):
    try:
        return Path(path).read_text().strip()
    except OSError:
        return ""


def note_ids():
    return {l.split("|", 1)[0] for l in read_quiet(SHELL / "remember.txt").splitlines() if l.strip()}


APPS = HERE.parent / "shell" / "root" / "YOLK"     # SHELL's Lua apps, as committed here


def update_apps():
    """Copies any of SHELL's apps (shell/root/YOLK/*.lua) that changed here onto SHELL,
    so fixes reach the iPod on the next plug-in. Only the .lua files at the top level;
    art and data are left to tools/restore_shell.py. Never for a test SHELL."""
    if os.environ.get("YOLK_SHELL") or not APPS.is_dir():
        return 0
    import shellio
    n = 0
    for src in sorted(APPS.glob("*.lua")):
        dst = SHELL / src.name
        data = src.read_bytes()
        try:
            if dst.exists() and dst.read_bytes() == data:
                continue
        except OSError:
            continue
        shellio.write(dst, data)
        print("SHELL: updated", src.name)
        n += 1
    return n


def brought_lines():
    """A sentence or two for SHELL about this trip, in her voice: what she took, what she left."""
    def some(n, one, many):
        return one if n == 1 else f"{n} {many}"

    def listed(items):
        return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]
    took, left = _trip.get("took", {}), _trip.get("left", {})
    t = []
    if took.get("checkins"):
        t.append(some(took["checkins"], "a check-in", "check-ins"))
    if took.get("meditations"):
        t.append(some(took["meditations"], "a meditation", "meditations"))
    if took.get("letters"):
        t.append(some(took["letters"], "your letter", "letters"))
    if took.get("plays"):
        t.append(some(took["plays"], "a song you played", "songs you played"))
    l = []
    if left.get("daily"):
        l.append("today's daily")
    if left.get("radio"):
        l.append("a radio show")
    if left.get("replies"):
        l.append(some(left["replies"], "a letter back", "letters back"))
    if left.get("notes"):
        l.append(some(left["notes"], "a new note", "new notes"))
    if left.get("her_dream") or left.get("mac_dreams"):
        l.append("a dream")
    if left.get("money"):
        l.append("your money numbers")
    if left.get("apps"):
        l.append("an update for " + ("one of my apps" if left["apps"] == 1 else f"{left['apps']} of my apps"))
    out = []
    if t:
        out.append("i took " + listed(t) + ".")
    if l:
        out.append("i left you " + listed(l) + ".")
    return out


def mount_id():
    """Changes every time SHELL is plugged in (the volume's folder is made fresh at each mount)."""
    try:
        st = os.stat(SHELL.parent)
        return (st.st_dev, getattr(st, "st_birthtime", st.st_ctime))
    except OSError:
        return None


def shell_done():
    """After the first full sync of a plug-in: tidy up, eject SHELL, and say it's safe to unplug.
    "shell_eject": false in data/daily.json keeps SHELL mounted (to copy music yourself);
    then the message just says the sync is done. Never ejects a test SHELL (YOLK_SHELL)."""
    mid = mount_id()
    if not mid or (_mount["id"] == mid and _mount["announced"]):
        return
    _mount["id"], _mount["announced"] = mid, True
    import daily
    import shellio
    shellio.cleanup(SHELL.parent / "YOLK")
    said = brought_lines()
    if said:                                # Talk to YOLK reads it once, after you unplug
        shellio.text(SHELL / "brought.txt", f"{int(time.time())}\n" + "".join(l + "\n" for l in said))
    real = not os.environ.get("YOLK_SHELL")
    eject = real and daily.config().get("shell_eject", True) is not False
    if eject:
        r = subprocess.run(["diskutil", "eject", str(SHELL.parent)], capture_output=True, text=True, timeout=60)
        msg = ("all synced. i ejected SHELL, so you can unplug it." if r.returncode == 0 else
               "all synced, but SHELL wouldn't eject (something has it open). eject it in finder before unplugging.")
        print("SHELL:", msg, r.stderr.strip())
    else:
        msg = "all synced. eject SHELL in finder before unplugging."
    if real:
        notify(msg)


def notify(msg):
    subprocess.run(["osascript", "-e", 'on run argv\n display notification (item 1 of argv) with title "YOLK" '
                    'subtitle "SHELL" sound name "Glass"\nend run', msg], capture_output=True, timeout=30)


def is_drop(e):
    """An error from SHELL's drive going away (I/O error, device gone), not some other
    problem such as the internet being down."""
    import errno
    return isinstance(e, OSError) and (e.errno in (errno.EIO, errno.ENXIO, errno.ENODEV)
                                       or (e.errno == errno.ENOENT and not shell_connected()))


def shell_dropped(e):
    """SHELL's drive stopped answering partway through a sync (a loose connection, or
    the cable pulled). Say so once per plug-in instead of crashing. Every sync step is
    safe to repeat, so plugging her back in finishes the job."""
    print("SHELL: dropped off mid-sync:", e)
    if _mount.get("dropped") == _mount["id"]:
        return
    _mount["dropped"] = _mount["id"]
    try:
        with open(DATA / "shell_drops.txt", "a") as f:     # a running count, for spotting hardware trouble
            f.write(f"{int(time.time())}\t{e}\n")
    except OSError:
        pass
    if not os.environ.get("YOLK_SHELL"):
        notify("SHELL dropped off partway through the sync. plug her back in and i'll finish.")


def sync():
    """Merge memories and hand queued dreams to SHELL. Safe to call often."""
    with _shell_lock:
        try:
            return _sync()
        except OSError as e:
            if not is_drop(e):
                raise
            shell_dropped(e)
            return read_mem(MEMORY), False


def _sync():
    desk = read_mem(MEMORY)
    if not shell_connected():
        return desk, False
    if _mount["id"] != mount_id():                 # just plugged in: not announced yet
        _mount["id"], _mount["announced"] = mount_id(), False
        _trip.clear()
        import shellio                              # finish any save SHELL froze in the middle of
        shellio.recover_shell(SHELL)
    shell = read_mem(SHELL / "memory.txt")
    mem = merge(desk, shell, read_mem(MERGED) if MERGED.exists() else None)
    write_mem(MEMORY, mem)
    write_mem(SHELL / "memory.txt", mem)
    write_mem(MERGED, mem)
    trip("left", "apps", update_apps())
    import journal                      # her notes from the Mac and the Station
    had = note_ids()
    journal.deliver(SHELL)
    trip("left", "notes", len(note_ids() - had))
    import letters                      # letters written on SHELL, and her replies
    trip("took", "letters", letters.on_sync(SHELL))
    try:
        import music                    # what you've played on SHELL
        trip("took", "plays", music.on_sync(SHELL))
    except Exception as e:
        print("YOLK couldn't read SHELL's play log:", e)
    # check-ins: union of both sides (newest wins per day), kept on both, so the
    # Mac also holds a backup for after SHELL's storage swap
    log = read_log(LOG)
    for d, e in read_log(SHELL / "log.txt").items():
        if d not in log:
            trip("took", "checkins", 1)
        if d not in log or e["time"] >= log[d]["time"]:
            log[d] = e
    if log:
        write_log(LOG, log)
        write_log(SHELL / "log.txt", log)
    med = SHELL / "med" / "sessions.txt"
    if med.exists():
        known = set(SHELL_MEDITATIONS.read_text().splitlines()) if SHELL_MEDITATIONS.exists() else set()
        new = [l for l in med.read_text().splitlines() if l.strip() and l not in known]
        trip("took", "meditations", len(new))
        if new:
            with open(SHELL_MEDITATIONS, "a") as f:
                f.write("".join(l + "\n" for l in new))
    import finance
    if finance.deliver(DATA, SHELL):
        trip("left", "money", 1)
    if HABITS.exists():
        import shellio
        shellio.text(SHELL / "habits.txt", HABITS.read_text(encoding="utf-8"))
    if QUEUE.exists() and QUEUE.read_text().strip():
        dreams = [l for l in QUEUE.read_text(encoding="utf-8").splitlines() if l.strip()]
        import shellio
        shellio.append(SHELL / "dreams.txt", "".join("dream: " + d + "\n" for d in dreams))
        trip("left", "mac_dreams", len(dreams))
        with open(SENT, "a", encoding="utf-8") as f:
            for d in dreams:
                f.write(f"{int(time.time())}\t{d}\n")
        QUEUE.write_text("")
    deliver_daily()
    return mem, True


_daily_lock = threading.Lock()


def deliver_daily():
    """Builds today's YOLK Daily if it's stale and copies it to SHELL, in the background."""
    def work():
        if not _daily_lock.acquire(blocking=False):
            return
        try:
            import daily
            built = False
            if daily.needs_build():
                daily.build()                       # can take a minute; SHELL isn't touched yet
                built = True
            import letters
            replies = lambda: sum(1 for l in letters.read() if l["from"] == "yolk")
            before = replies()
            letters.answer_pending()                # Claude writes back (Mac side only, no SHELL yet)
            with _shell_lock:
                if not shell_connected():
                    return
                letters.deliver(SHELL)
                trip("left", "replies", replies() - before)
                if built or not (SHELL.parent / "Music" / "YOLK Daily" / "YOLK Daily.m4a").exists():
                    radio_day = read_quiet(SHELL / "radio" / "day.txt")
                    ai_day = read_quiet(daily.ai.OUT / "delivered.txt")
                    if daily.deliver():
                        trip("left", "daily", 1)
                    if read_quiet(SHELL / "radio" / "day.txt") != radio_day:
                        trip("left", "radio", 1)
                    if read_quiet(daily.ai.OUT / "delivered.txt") != ai_day:
                        trip("left", "her_dream", 1)
                shell_done()                        # everything's on SHELL: say what, eject, notify
        except Exception as e:
            if is_drop(e):
                shell_dropped(e)
            else:
                print("YOLK Daily failed:", e)
        finally:
            _daily_lock.release()
    threading.Thread(target=work, daemon=True).start()


def keep_backing_up():
    """Once a day, a copy of her memory goes to iCloud Drive (backup.py).
    Test runs with their own YOLK_DATA skip it unless they set YOLK_BACKUP too."""
    if os.environ.get("YOLK_DATA") and not os.environ.get("YOLK_BACKUP"):
        return

    def loop():
        import backup
        while True:
            try:
                made = backup.daily()
                if made:
                    print(f"Backed up {made[1]} files to {made[0]}")
            except Exception as e:
                print("YOLK couldn't back up:", e)
            time.sleep(3600)
    threading.Thread(target=loop, daemon=True).start()


def keep_nudging():
    """Every 10 minutes she considers texting first (nudge.py) and, on Sunday evening,
    sends the weekly letter (sunday.py). Never in test runs."""
    if os.environ.get("YOLK_DATA"):
        return

    def loop():
        import nudge
        time.sleep(60)
        while True:
            try:
                import sunday
                if sunday.check():                  # Sunday evening: the weekly letter
                    print("Sent the Sunday letter")
                done = nudge.check()
                if done:
                    print(f"Texted ({done[0]}): {done[1]}")
            except Exception as e:
                print("YOLK couldn't text:", e)
            time.sleep(600)
    threading.Thread(target=loop, daemon=True).start()


# ------------------------------------------------------------------ extras
def mac_battery():
    """Percent, or None on a Mac without a battery."""
    try:
        out = subprocess.run(["pmset", "-g", "batt"], capture_output=True, text=True, timeout=2).stdout
        m = re.search(r"(\d+)%", out)
        return int(m.group(1)) if m else None
    except Exception:
        return None


def moe(n):
    try:
        L = int((MOEKADEX / "reclen.txt").read_text())
        with open(MOEKADEX / "data.txt", "rb") as f:
            f.seek((n - 1) * L)
            line = f.read(L - 1).decode("latin-1").rstrip()
    except Exception:
        return None
    parts = line.split("|")
    traits = [dict(zip(("type", "value", "pct"), t.split("~"))) for t in parts[2:]]
    return {"n": n, "rank": int(parts[0]), "tier": parts[1], "traits": traits}


def moe_photo(n):
    lo = (n - 1) // 250 * 250 + 1
    return MOE_PHOTOS / f"Moes {lo:04d}-{min(lo + 249, 5250):04d}" / f"Moe {n:04d}.jpg"


def speak_clip(text):
    """Reed (or whatever daily.json says) saying `text`, as a cached m4a."""
    import daily
    cfg = daily.config()
    key = hashlib.sha1(f"{cfg['voice']}|{cfg['rate']}|{text}".encode()).hexdigest()[:20]
    out = TTS / f"{key}.m4a"
    if not out.exists():
        TTS.mkdir(parents=True, exist_ok=True)
        daily.speak(text, cfg["voice"], cfg["rate"], out)
        clips = sorted(TTS.glob("*.m4a"), key=lambda p: p.stat().st_mtime)
        for old in clips[:-400]:          # keep the cache from growing forever
            old.unlink()
    return out.read_bytes()


_ambient = {"at": 0, "data": None}


def ambient():
    """What the Station shows while idle: weather, Moe of the day, streaks."""
    if time.time() - _ambient["at"] > 1800 or not _ambient["data"]:
        import datetime
        import random
        import daily
        today = datetime.date.today()
        n = random.Random(today.toordinal()).randint(1, 5250)
        st = stats()
        best = max(st["streaks"].items(), key=lambda kv: kv[1], default=(None, 0)) if st["streaks"] else (None, 0)
        _ambient["data"] = {
            "weather": daily.weather_data(daily.config()["city"], today),
            "moe": moe(n),
            "streak": {"habit": best[0], "days": best[1]} if best[1] >= 2 else None,
            "daily": (daily.OUT / "daily.txt").read_text(encoding="utf-8") if (daily.OUT / "daily.txt").exists() else "",
        }
        _ambient["at"] = time.time()
    try:
        import wedding
        countdown = wedding.short()
    except Exception:
        countdown = None
    return {**_ambient["data"], "meditation": meditation_stats(), "reminders": holding(), "wedding": countdown}


def holding(limit=4):
    """Reminders and dated notes she's keeping for today or later, soonest first, for the Station."""
    import datetime
    import journal
    now = datetime.datetime.now()
    today = now.date()
    out = []
    for n in journal.read():
        if not n.get("on") or n["on"] < today.isoformat():
            continue
        day = datetime.date.fromisoformat(n["on"])
        if n.get("at"):
            at = datetime.datetime.combine(day, datetime.datetime.strptime(n["at"], "%H:%M").time())
            if at < now - datetime.timedelta(hours=3):      # sent (or missed) already
                continue
            h, m = at.hour, at.minute
            clock = "noon" if (h, m) == (12, 0) else "midnight" if (h, m) == (0, 0) else \
                f"{h % 12 or 12}{':%02d' % m if m else ''} {'am' if h < 12 else 'pm'}"
        else:
            clock = ""
        name = "today" if day == today else "tomorrow" if day == today + datetime.timedelta(days=1) else \
            day.strftime("%a %b ").lower() + str(day.day)
        out.append({"note": n["note"], "when": (name + (" at " + clock if clock else "")),
                    "timed": bool(n.get("at")), "sort": n["on"] + (n.get("at") or "99:99")})
    out.sort(key=lambda r: r["sort"])
    return [{k: v for k, v in r.items() if k != "sort"} for r in out[:limit]]


# ------------------------------------------------------------------ http
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
         ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg",
         ".webmanifest": "application/manifest+json", ".m4a": "audio/mp4", ".wav": "audio/wav"}


def watch_page(you="", answer=""):
    """YOLK's chat page for the Apple Watch. Opened from a link in Messages, since the watch
    has no browser of its own. Plain HTML form, no JavaScript, so the watch's web view copes."""
    import html
    said = '<p class="her">i&#39;m here.</p>'
    if you:
        said = f'<p class="you">{html.escape(you)}</p><p class="her">{html.escape(answer)}</p>'
    return f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="disabled-adaptations" content="watch">
<title>YOLK</title><style>
body{{background:#000;color:#ffb000;font:15px -apple-system,sans-serif;margin:0;padding:4px 6px;text-align:center}}
img{{width:44px;height:44px;image-rendering:pixelated}}
.you{{color:#777;font-size:13px;margin:4px 0}} .her{{margin:4px 0 10px}}
input{{width:100%;box-sizing:border-box;font-size:15px;padding:6px;border-radius:8px;border:1px solid #ffb000;background:#111;color:#ffb000}}
button{{width:100%;margin-top:6px;font-size:15px;padding:6px;border-radius:8px;border:0;background:#ffb000;color:#000}}
</style></head><body>
<img src="/faces/good.png" alt="">
{said}
<form method="post"><input name="text" placeholder="talk to yolk" autocomplete="off"><button>say it</button></form>
</body></html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return {}

    # ---- pairing: this Mac is always trusted; anything else needs the token cookie
    PUBLIC = ("/pair", "/pair.html", "/api/pair", "/faces/good.png", "/faces/blink.png")

    def trusted(self):
        if self.client_address[0] in ("127.0.0.1", "::1"):
            return True
        token = station_config()["token"]
        return f"yolk_pair={token}" in (self.headers.get("Cookie") or "")

    def watch_ok(self, path):
        """The Apple Watch Shortcut can't keep a cookie, so it sends its own key, either in a
        header (X-YOLK-Key) or at the end of the address (/api/watch/<key>, easier to set up by hand)."""
        key = self.headers.get("X-YOLK-Key") or path.rsplit("/", 1)[-1]
        return secrets.compare_digest(key.strip(), station_config()["watch_key"])

    def phone_ok(self, path):
        """The phone page lives at /p/<watch key>/..., so a home-screen app needs no cookie."""
        parts = path.split("/")
        return len(parts) > 2 and secrets.compare_digest(parts[2], station_config()["watch_key"])

    def gate(self, path):
        """True if the request may continue; otherwise answers it with the pairing page."""
        if self.trusted() or path in self.PUBLIC:
            return True
        if path.startswith("/p/") and self.phone_ok(path):
            return True
        if (path == "/api/watch" or path.startswith(("/api/watch/", "/w/"))) and self.watch_ok(path):
            return True
        if path.startswith("/api/"):
            self.send(403, {"error": "pair first"})
        else:
            self.send_response(302)
            self.send_header("Location", "/pair")
            self.end_headers()
        return False

    def do_GET(self):
        path = self.path.split("?")[0]
        if not self.gate(path):
            return
        if path.startswith("/w/"):           # the Apple Watch chat page
            return self.send(200, watch_page(), TYPES[".html"])
        if path.startswith("/p/"):           # the phone page (static/phone.html), /p/<watch key>/...
            rest = path.split("/", 3)[3] if path.count("/") >= 3 else ""
            if rest == "icon.png":
                return self.send(200, (STATIC / "faces" / "big" / "good.png").read_bytes(), "image/png")
            if rest.startswith("face/") and re.match(r"^[a-z]+$", rest[5:-4] or "-") and rest.endswith(".png"):
                f = STATIC / "faces" / rest[5:]
                return self.send(200, f.read_bytes(), "image/png") if f.is_file() else self.send(404, {})
            if rest == "recent":             # her texts from the last two days, so the page reads like a thread
                import nudge
                return self.send(200, {"texts": [{"t": s["t"], "text": s["text"]} for s in nudge.sent()
                                                 if time.time() - s["t"] < 2 * 86400 and s["why"] != "test"]})
            return self.send(200, (STATIC / "phone.html").read_bytes(), TYPES[".html"])
        if path == "/pair":
            path = "/pair.html"
        if path == "/station":
            path = "/station.html"
        if path == "/api/ambient":
            return self.send(200, ambient())
        if path == "/api/numbers":           # the Station asks every minute (numberstation.py)
            import numberstation
            return self.send(200, numberstation.status())
        if path == "/api/say":
            from urllib.parse import parse_qs, urlparse
            text = (parse_qs(urlparse(self.path).query).get("t") or [""])[0].strip()[:300]
            if not text:
                return self.send(400, {"error": "empty"})
            try:
                return self.send(200, speak_clip(text), "audio/mp4")
            except Exception as e:
                return self.send(500, {"error": str(e)})
        if path == "/api/pairing":           # for the desktop terminal ("pair a tablet")
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                return self.send(403, {"error": "only on the mac"})
            return self.send(200, {"code": station_config()["code"], "address": lan_address(), "port": PORT})
        if path == "/api/watchkey":          # for setting up the Apple Watch Shortcut; this Mac only
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                return self.send(403, {"error": "only on the mac"})
            return self.send(200, {"key": station_config()["watch_key"], "address": lan_address(), "port": PORT})
        if path in ("/finance", "/api/finance"):      # money stays on this Mac, even for paired tablets
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                return self.send(403, {"error": "only on the mac"})
            if path == "/finance":
                return self.send(200, (STATIC / "finance.html").read_bytes(), TYPES[".html"])
            f = DATA / "finance.json"
            return self.send(200, f.read_bytes() if f.exists() else {})
        if path == "/api/state":
            mem, connected = sync()
            queued = [l for l in QUEUE.read_text(encoding="utf-8").splitlines() if l.strip()] if QUEUE.exists() else []
            return self.send(200, {"memory": mem, "shell": connected, "queued": len(queued),
                                   "battery": mac_battery(), "now": int(time.time())})
        if path == "/api/letter":             # her newest Sunday letter (sunday.py); this Mac only
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                return self.send(403, {"error": "only on the mac"})
            import sunday
            return self.send(200, sunday.latest() or {})
        if path == "/api/journal":            # what she remembers; personal, so this Mac only
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                return self.send(403, {"error": "only on the mac"})
            import journal
            return self.send(200, {"notes": [dict(n, when=journal.when(n["t"]),
                                                  place=journal.PLACES.get(n["where"], n["where"]))
                                             for n in journal.read()]})
        if path == "/api/stats":
            return self.send(200, {**stats(), "meditation": meditation_stats()})
        if path == "/api/lines":
            return self.send(200, (HERE / "brain" / "lines.json").read_bytes())
        m = re.match(r"^/api/moe/(\d+)$", path)
        if m:
            n = int(m.group(1))
            info = moe(n) if 1 <= n <= 5250 else None
            return self.send(200 if info else 404, info or {"error": "no such moe"})
        m = re.match(r"^/moe/(\d+)\.jpg$", path)
        if m:
            p = moe_photo(int(m.group(1)))
            return self.send(200, p.read_bytes(), "image/jpeg") if p.exists() else self.send(404, {})
        # static files (file names can have spaces, which arrive as %20)
        from urllib.parse import unquote
        rel = "index.html" if path == "/" else unquote(path).lstrip("/")
        f = (STATIC / rel).resolve()
        if STATIC in f.parents and f.is_file():
            return self.send(200, f.read_bytes(), TYPES.get(f.suffix, "application/octet-stream"))
        return self.send(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        if not self.gate(path):
            return
        if path == "/api/phonelink":         # texts the phone app's link (static/phone.html); this Mac only
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                return self.send(403, {"error": "only on the mac"})
            import daily
            import nudge
            who = daily.config().get("text_to")
            if not who:
                return self.send(400, {"error": "no text_to in data/daily.json"})
            host = subprocess.run(["scutil", "--get", "LocalHostName"], capture_output=True, text=True).stdout.strip()
            link = f"http://{host}.local:{PORT}/p/{station_config()['watch_key']}/"
            try:
                nudge.send(who, "🥚 me, in your pocket. open this in safari, tap share, then add to home screen. "
                                "home wi-fi only.\n\n" + link)
            except Exception as e:
                return self.send(500, {"error": str(e)})
            return self.send(200, {"sent": True})
        if path == "/api/nudge/test":         # nudge.py --test: one text now, sent from here so macOS asks about YOLK
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                return self.send(403, {"error": "only on the mac"})
            import nudge
            try:
                return self.send(200, {"sent": nudge.test()})
            except Exception as e:
                return self.send(500, {"error": str(e)})
        if path.startswith("/p/") and path.endswith("/chat"):   # the phone page talking
            import chat
            data = self.body()
            text = str(data.get("text", "")).strip()[:1000]
            if not text:
                return self.send(400, {"error": "empty"})
            try:
                return self.send(200, {"reply": chat.reply(text, new=bool(data.get("new")), where="phone")})
            except Exception as e:
                print("YOLK phone chat failed:", e)
                return self.send(200, {"reply": "my brain glitched. try again in a second."})
        if path.startswith("/w/"):           # the Apple Watch chat page's form
            import chat
            from urllib.parse import parse_qs
            n = int(self.headers.get("Content-Length", 0) or 0)
            form = parse_qs(self.rfile.read(min(n, 20000)).decode("utf-8", "replace"))
            text = (form.get("text") or [""])[0].strip()[:1000]
            if not text:
                return self.send(200, watch_page(), TYPES[".html"])
            try:
                answer = chat.reply(text, where="watch")
            except Exception as e:
                print("YOLK watch chat failed:", e)
                answer = "my brain glitched. try again in a second."
            return self.send(200, watch_page(text, answer), TYPES[".html"])
        if path == "/api/watch" or path.startswith("/api/watch/"):   # the Apple Watch Shortcut: plain text in, plain text out
            import chat
            n = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(min(n, 20000)).decode("utf-8", "replace").strip()
            try:                             # a bare sentence, or {"text": "..."}
                raw = str(json.loads(raw).get("text", ""))
            except (ValueError, AttributeError):
                pass
            text = raw.strip()[:1000]
            if not text:
                return self.send(200, "...you said nothing. i heard it anyway.", "text/plain; charset=utf-8")
            try:
                answer = chat.reply(text, where="watch")
            except Exception as e:
                print("YOLK watch chat failed:", e)
                answer = "my brain glitched. try again in a second."
            return self.send(200, answer, "text/plain; charset=utf-8")
        if path == "/api/talk":              # a WAV recording from the Station's mic
            import chat
            n = int(self.headers.get("Content-Length", 0) or 0)
            if not 0 < n <= 5_000_000:
                return self.send(413, {"error": "recording too long"})
            return self.send(200, chat.talk(self.rfile.read(n), new="new=1" in self.path))
        data = self.body()
        if path == "/api/finance":
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                return self.send(403, {"error": "only on the mac"})
            tmp = DATA / "finance.json.tmp"
            tmp.write_text(json.dumps(data, indent=2))
            tmp.replace(DATA / "finance.json")
            return self.send(200, {"ok": True})
        if path == "/api/chat":              # typed conversation from the desktop terminal
            import chat
            text = str(data.get("text", "")).strip()[:1000]
            if not text:
                return self.send(400, {"error": "empty"})
            try:
                return self.send(200, {"reply": chat.reply(text, bool(data.get("new")), where="desk")})
            except Exception as e:
                print("YOLK chat failed:", e)
                return self.send(200, {"reply": "my brain glitched. try again in a second."})
        if path == "/api/pair":
            now = time.time()
            if now < _bad_codes["until"]:
                return self.send(429, {"error": "too many tries, wait a few minutes"})
            cfg = station_config()
            if str(data.get("code", "")).strip() != cfg["code"]:
                _bad_codes["n"] += 1
                if _bad_codes["n"] >= 8:
                    _bad_codes["n"], _bad_codes["until"] = 0, now + 300
                return self.send(403, {"error": "wrong code"})
            _bad_codes["n"] = 0
            body = json.dumps({"ok": True}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Set-Cookie", f"yolk_pair={cfg['token']}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Strict")
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/memory":
            mem = read_mem(MEMORY)
            for k, v in data.items():
                if re.match(r"^\w+$", k):
                    mem[k] = str(v).replace("\n", " ")[:64]
            mem["last_seen"] = str(int(time.time()))
            write_mem(MEMORY, mem)
            mem, connected = sync()
            return self.send(200, {"memory": mem, "shell": connected})
        if path == "/api/forget":
            if self.client_address[0] not in ("127.0.0.1", "::1"):
                return self.send(403, {"error": "only on the mac"})
            import journal
            notes = journal.change(forget=[data.get("id")])
            sync()
            return self.send(200, {"left": len(notes)})
        if path == "/api/numbers":           # the Numbers Station: played / mode / now / decode
            import numberstation
            if data.get("decode") and self.client_address[0] not in ("127.0.0.1", "::1"):
                data.pop("decode")              # the answer stays on the Mac
            return self.send(200, numberstation.handle(data))
        if path == "/api/meditate":
            mins = int(data.get("minutes", 0) or 0)
            if not 1 <= mins <= 180:
                return self.send(400, {"error": "minutes?"})
            DATA.mkdir(parents=True, exist_ok=True)
            with open(MEDITATIONS, "a") as f:
                f.write(f"{int(time.time())}|{mins}\n")
            return self.send(200, meditation_stats())
        if path == "/api/habits":
            items = [re.sub(r"[|,\n]", "", str(h)).strip().lower()[:20] for h in data.get("habits", [])]
            items = [h for h in items if h][:12]
            if not items:
                return self.send(400, {"error": "empty"})
            DATA.mkdir(parents=True, exist_ok=True)
            HABITS.write_text("\n".join(items) + "\n", encoding="utf-8")
            sync()
            return self.send(200, {"habits": items})
        if path == "/api/remind":
            text = str(data.get("text", "")).replace("\n", " ").strip()[:200]
            if not text:
                return self.send(400, {"error": "empty"})
            DATA.mkdir(parents=True, exist_ok=True)
            with open(DATA / "reminders.txt", "a", encoding="utf-8") as f:
                f.write(text + "\n")
            return self.send(200, {"ok": True})
        if path == "/api/dream":
            text = str(data.get("text", "")).replace("\n", " ").strip()[:200]
            if not text:
                return self.send(400, {"error": "empty"})
            DATA.mkdir(parents=True, exist_ok=True)
            with open(QUEUE, "a", encoding="utf-8") as f:
                f.write(text + "\n")
            _, connected = sync()
            return self.send(200, {"sent": connected})
        return self.send(404, {"error": "not found"})


if __name__ == "__main__":
    DATA.mkdir(parents=True, exist_ok=True)
    cfg = station_config()
    print(f"YOLK is awake at http://localhost:{PORT}")
    addr = lan_address()
    if addr:
        print(f"YOLK Station (tablet): http://{addr}:{PORT}/station   pairing code: {cfg['code']}")
    keep_backing_up()
    keep_nudging()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
