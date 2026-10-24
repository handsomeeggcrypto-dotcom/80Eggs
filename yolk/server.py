#!/usr/bin/env python3
"""YOLK's home on the Mac: serves the desktop terminal and syncs with SHELL.

  python3 yolk/server.py        -> http://localhost:8008

YOLK Station (the tablet) reaches it over home Wi-Fi at http://<mac's address>:8008.
Anything not on this Mac must pair first with the code in data/station.json
(printed at startup, and shown by the desktop terminal's "pair a tablet").

Memory lives in yolk/data/memory.txt (same key=value format as SHELL's
/YOLK/memory.txt). Whenever SHELL is plugged in, the two memories are merged
and any dreams left for SHELL are written to its /YOLK/dreams.txt.
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
    if "code" not in cfg:
        cfg["code"] = f"{secrets.randbelow(1000000):06d}"
        cfg["token"] = secrets.token_hex(16)
        STATION.write_text(json.dumps(cfg, indent=2))
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
    path.write_text(text.encode("latin-1", "replace").decode("latin-1"), encoding="latin-1")


def stamp(mem):
    return int(mem.get("last_seen", 0) or 0)


COUNTERS = ("visits", "desk_visits", "affection", "dreams_seen")


def merge(desk, shell):
    """Whichever side was used most recently wins on shared keys; counters only go up."""
    newer, older = (shell, desk) if stamp(shell) > stamp(desk) else (desk, shell)
    out = dict(older)
    out.update(newer)
    for k in COUNTERS:
        vals = [int(m[k]) for m in (desk, shell) if str(m.get(k, "")).isdigit()]
        if vals:
            out[k] = str(max(vals))
    return out


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
    path.write_text("".join(f"{e['day']}|{e['time']}|{e['mood']}|{','.join(sorted(e['habits']))}\n"
                            for _, e in sorted(entries.items())), encoding="latin-1")


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
    moods = [e["mood"] for e in recent if e]
    return {
        "habits": habits(),
        "entries": [e or {"day": last - 6 + i, "mood": None, "habits": []} for i, e in enumerate(recent)],
        "streaks": {h: streak(entries, h, last) for h in habits()},
        "mood_avg": round(sum(moods) / len(moods), 1) if moods else None,
        "total": len(entries),
    }


# ------------------------------------------------------------------ meditation
# Sessions from the Station: "unixtime|minutes". Kept apart from SHELL's
# check-ins until SHELL's clock is right (its day numbers don't match real days).
MEDITATIONS = DATA / "meditations.txt"


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
    today = local_day(time.time())
    d = today if today in days else today - 1          # today not done yet doesn't break it
    streak = 0
    while d in days:
        streak += 1
        d -= 1
    week = sum(mins for t, mins in sessions if local_day(t) > today - 7)
    return {"streak": streak, "today": today in days, "sessions": len(sessions),
            "minutes_week": week, "minutes_total": sum(m for _, m in sessions)}


def shell_connected():
    return SHELL.is_dir()


def sync():
    """Merge memories and hand queued dreams to SHELL. Safe to call often."""
    desk = read_mem(MEMORY)
    if not shell_connected():
        return desk, False
    shell = read_mem(SHELL / "memory.txt")
    mem = merge(desk, shell)
    write_mem(MEMORY, mem)
    write_mem(SHELL / "memory.txt", mem)
    # check-ins: union of both sides (newest wins per day), kept on both, so the
    # Mac also holds a backup for after SHELL's storage swap
    log = read_log(LOG)
    for d, e in read_log(SHELL / "log.txt").items():
        if d not in log or e["time"] >= log[d]["time"]:
            log[d] = e
    if log:
        write_log(LOG, log)
        write_log(SHELL / "log.txt", log)
    if HABITS.exists():
        (SHELL / "habits.txt").write_text(HABITS.read_text(encoding="utf-8"), encoding="latin-1", errors="replace")
    if QUEUE.exists() and QUEUE.read_text().strip():
        dreams = [l for l in QUEUE.read_text(encoding="utf-8").splitlines() if l.strip()]
        with open(SHELL / "dreams.txt", "a", encoding="latin-1", errors="replace") as f:
            for d in dreams:
                f.write("dream: " + d + "\n")
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
            if daily.needs_build():
                daily.build()
                daily.deliver()
            elif not (SHELL.parent / "Music" / "YOLK Daily" / "YOLK Daily.m4a").exists():
                daily.deliver()
        except Exception as e:
            print("YOLK Daily failed:", e)
        finally:
            _daily_lock.release()
    threading.Thread(target=work, daemon=True).start()


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
    return {**_ambient["data"], "meditation": meditation_stats()}


# ------------------------------------------------------------------ http
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
         ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg",
         ".webmanifest": "application/manifest+json", ".m4a": "audio/mp4", ".wav": "audio/wav"}


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

    def gate(self, path):
        """True if the request may continue; otherwise answers it with the pairing page."""
        if self.trusted() or path in self.PUBLIC:
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
        if path == "/pair":
            path = "/pair.html"
        if path == "/station":
            path = "/station.html"
        if path == "/api/ambient":
            return self.send(200, ambient())
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
        if path == "/api/state":
            mem, connected = sync()
            queued = [l for l in QUEUE.read_text(encoding="utf-8").splitlines() if l.strip()] if QUEUE.exists() else []
            return self.send(200, {"memory": mem, "shell": connected, "queued": len(queued),
                                   "battery": mac_battery(), "now": int(time.time())})
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
        if path == "/api/talk":              # a WAV recording from the Station's mic
            import chat
            n = int(self.headers.get("Content-Length", 0) or 0)
            if not 0 < n <= 5_000_000:
                return self.send(413, {"error": "recording too long"})
            return self.send(200, chat.talk(self.rfile.read(n), new="new=1" in self.path))
        data = self.body()
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
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
