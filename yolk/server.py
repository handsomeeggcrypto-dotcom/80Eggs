#!/usr/bin/env python3
"""YOLK's home on the Mac: serves the desktop terminal and syncs with SHELL.

  python3 yolk/server.py        -> http://localhost:8008

Memory lives in yolk/data/memory.txt (same key=value format as SHELL's
/YOLK/memory.txt). Whenever SHELL is plugged in, the two memories are merged
and any dreams left for SHELL are written to its /YOLK/dreams.txt.
Only listens on this computer (127.0.0.1).
"""
import json
import os
import re
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATIC = HERE / "static"
DATA = HERE / "data"            # personal; not in git
MEMORY = DATA / "memory.txt"
QUEUE = DATA / "dreams_queue.txt"
SENT = DATA / "dreams_sent.txt"

SHELL = Path(os.environ.get("YOLK_SHELL", "/Volumes/SHELL/YOLK"))  # override for testing
MOEKADEX = Path.home() / "80Eggs" / "shell" / "root" / "YOLK" / "moekadex"
MOE_PHOTOS = Path.home() / "80Eggs" / "moekedex" / "ipod_photos"

PORT = 8008


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


# ------------------------------------------------------------------ http
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
         ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg"}


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

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/state":
            mem, connected = sync()
            queued = [l for l in QUEUE.read_text(encoding="utf-8").splitlines() if l.strip()] if QUEUE.exists() else []
            return self.send(200, {"memory": mem, "shell": connected, "queued": len(queued),
                                   "battery": mac_battery(), "now": int(time.time())})
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
        # static files
        rel = "index.html" if path == "/" else path.lstrip("/")
        f = (STATIC / rel).resolve()
        if STATIC in f.parents and f.is_file():
            return self.send(200, f.read_bytes(), TYPES.get(f.suffix, "application/octet-stream"))
        return self.send(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        data = self.body()
        if path == "/api/memory":
            mem = read_mem(MEMORY)
            for k, v in data.items():
                if re.match(r"^\w+$", k):
                    mem[k] = str(v).replace("\n", " ")[:64]
            mem["last_seen"] = str(int(time.time()))
            write_mem(MEMORY, mem)
            mem, connected = sync()
            return self.send(200, {"memory": mem, "shell": connected})
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
    print(f"YOLK is awake at http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
