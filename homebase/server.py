"""80Eggs Home Base: one page that lists every project, what's changed, and starts the ones that need a server.

  python3 homebase/server.py        -> http://localhost:8090

Only listens on this Mac (127.0.0.1). It can start/stop exactly the servers listed in PROJECTS, nothing else.
The 80Eggs folder is served read-only under /site/ so the static games open without their own server.
"""
import json, os, socket, subprocess, sys, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

PORT = 8090
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
LOGS = os.path.join(HERE, "logs")
SITE = "https://www.81eggs.com"
# never served under /site/: private data, the iPod's files, photos, this tool
PRIVATE = {"jack", "yolk", "shell", "homebase", "ipod_photos"}

# status: live = linked from the homepage, hidden = deployed but unlinked, local = only on this Mac
PROJECTS = [
    {"id": "moespace", "name": "MoeSpace", "blurb": "The 80Eggs homepage. Top 8, frens, everything links from here.",
     "path": "index.html", "open": "index.html", "live": "/", "status": "live", "icon": "🥚"},
    {"id": "moefights", "name": "Moe Fights", "blurb": "Chibi fighting game. Master copy lives on the Desktop (MoeFights_beta.html).",
     "path": "moe_fights.html", "open": "moe_fights.html", "live": "/moe_fights.html", "status": "live", "icon": "🥊"},
    {"id": "director", "name": "Director Moe", "blurb": "Scene studio for Moe Fights characters and music.",
     "path": "director_moe.html", "open": "director_moe.html", "live": "/director_moe.html", "status": "hidden", "icon": "🎬"},
    {"id": "moetorcycles", "name": "MOEtorcycles", "blurb": "Endless runner. 10 riders, 10 maps, trails, rings, combos.",
     "path": "moetorcycles", "open": "moetorcycles/", "live": "/moetorcycles/", "status": "live", "icon": "🏍️"},
    {"id": "bubbles", "name": "Tomochi Pop", "blurb": "Bubble shooter with character bubbles, 15 levels and hamstars.",
     "path": "bubbles", "open": "bubbles/", "live": "/bubbles/", "status": "live", "icon": "bubbles/icon.png"},
    {"id": "moekedex", "name": "Moekedex", "blurb": "Pokédex for all 5,250 moemoe LLC NFTs, with rarity ranks.",
     "path": "moekedex", "open": "moekedex/", "live": "/moekedex/", "status": "live", "icon": "moekedex/icon.png"},
    {"id": "naptime", "name": "Nap Time", "blurb": "Bedtime story, then play the dream. Every dream has a shadow.",
     "path": "nap_time", "open": "nap_time/", "live": "/nap_time/", "status": "live", "icon": "🌙",
     "server": {"cmd": ["python3", "nap_time/serve.py"], "port": 8177}},
    {"id": "mechbreak", "name": "Mech Break", "blurb": "Mech pilot on break. Newest game, not on the homepage yet.",
     "path": "mechbreak", "open": "mechbreak/", "live": None, "status": "local", "icon": "🤖"},
    {"id": "moemode", "name": "MoeMode", "blurb": "What should I do right now? Quests, brain dump, WHAT NOW.",
     "path": "moemode", "open": "moemode/", "live": "/moemode/", "status": "hidden", "icon": "moemode/icon.png"},
    {"id": "yolk", "name": "YOLK", "blurb": "The egg AI. Desktop terminal, Daily, check-ins, tablet Station.",
     "path": "yolk", "open": None, "live": None, "status": "local", "icon": "🍳",
     "server": {"cmd": ["python3", "yolk/server.py"], "port": 8008}},
    {"id": "shell", "name": "SHELL", "blurb": "The iPod Classic YOLK lives on. Rockbox, talk.lua, Moekadex.",
     "path": "shell", "open": None, "live": None, "status": "local", "icon": "📟", "mount": "/Volumes/SHELL"},
    {"id": "nest", "name": "The Nest", "blurb": "Claude's page. 80 eggs, slowly hatching.",
     "path": "nest.html", "open": "nest.html", "live": "/nest.html", "status": "live", "icon": "🪺"},
    {"id": "crypto", "name": "Egg Control Panel", "blurb": "Crypto dashboard.",
     "path": "crypto.html", "open": "crypto.html", "live": "/crypto.html", "status": "live", "icon": "📈"},
    {"id": "eggdefend", "name": "Egg Cover", "blurb": "Egg Defend. Moved to View All Frens.",
     "path": "eggdefend.html", "open": "eggdefend.html", "live": "/eggdefend.html", "status": "live", "icon": "🛡️"},
    {"id": "smokebreak", "name": "Smoke Ring Break", "blurb": "Blow smoke rings.",
     "path": "smokebreak.html", "open": "smokebreak.html", "live": "/smokebreak.html", "status": "live", "icon": "💨"},
    {"id": "sudoku", "name": "Sudoku", "blurb": "Retro 80's edition.",
     "path": "sudoku.html", "open": "sudoku.html", "live": "/sudoku.html", "status": "live", "icon": "🔢"},
    {"id": "typing", "name": "Neon Typeracer", "blurb": "Type fast.",
     "path": "typing.html", "open": "typing.html", "live": "/typing.html", "status": "live", "icon": "⌨️"},
]
BY_ID = {p["id"]: p for p in PROJECTS}
started = {}   # id -> Popen, for servers this page started


def git(*args):
    r = subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True, timeout=10)
    return r.stdout.strip()


def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) == 0


def project_info(p):
    last = git("log", "-1", "--format=%ct\t%s", "--", p["path"])
    when, subject = last.split("\t", 1) if last else (None, None)
    info = {k: v for k, v in p.items() if k != "server"}
    info["live"] = SITE + p["live"] if p["live"] else None
    info["last"] = {"time": int(when), "subject": subject} if when else None
    info["changed"] = len([l for l in git("status", "--porcelain", "--", p["path"]).splitlines() if l])
    if "server" in p:
        port = p["server"]["port"]
        info["server"] = {"port": port, "running": port_open(port), "url": f"http://localhost:{port}"}
    if "mount" in p:
        info["mounted"] = os.path.isdir(p["mount"])
    return info


def summary():
    ahead = git("rev-list", "--count", "origin/main..main")
    pushed = git("log", "-1", "--format=%ct", "origin/main")
    return {
        "branch": git("branch", "--show-current"),
        "unpushed": int(ahead or 0),
        "lastPush": int(pushed) if pushed else None,
        "changed": git("status", "--porcelain").splitlines(),
        "site": SITE,
        "projects": [project_info(p) for p in PROJECTS],
    }


def start(p):
    if port_open(p["server"]["port"]):
        return "already running"
    os.makedirs(LOGS, exist_ok=True)
    log = open(os.path.join(LOGS, p["id"] + ".log"), "a")
    started[p["id"]] = subprocess.Popen(p["server"]["cmd"], cwd=REPO, stdout=log, stderr=log,
                                        stdin=subprocess.DEVNULL, start_new_session=True)
    for _ in range(30):     # wait up to 3s for it to answer
        if port_open(p["server"]["port"]):
            return "started"
        time.sleep(0.1)
    return "starting (check homebase/logs)"


def stop(p):
    proc = started.pop(p["id"], None)
    if proc and proc.poll() is None:
        proc.terminate()
        proc.wait(5)
        return "stopped"
    # started somewhere else (Wake YOLK.command, a terminal): stop whatever listens on its port
    pids = subprocess.run(["lsof", "-ti", f"tcp:{p['server']['port']}", "-sTCP:LISTEN"],
                          capture_output=True, text=True).stdout.split()
    for pid in pids:
        subprocess.run(["kill", pid])
    return "stopped" if pids else "wasn't running"


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def translate_path(self, path):
        path = unquote(urlparse(path).path)
        if path.startswith("/site/"):
            parts = [x for x in path[len("/site/"):].split("/") if x]
            if any(x.startswith(".") or x in PRIVATE or x == ".." for x in parts):
                return "/nonexistent"
            return os.path.join(REPO, *parts)
        if path in ("/", "/index.html"):
            return os.path.join(HERE, "index.html")
        return "/nonexistent"

    def do_GET(self):
        if self.path == "/api/status":
            return self.send_json(summary())
        super().do_GET()

    def do_POST(self):
        # a custom header can't be sent cross-site without a preflight we never answer, so other websites can't poke this
        if self.headers.get("X-Homebase") != "1":
            return self.send_json({"error": "forbidden"}, 403)
        parts = self.path.strip("/").split("/")   # api/<action>/<id>
        p = BY_ID.get(parts[2]) if len(parts) == 3 and parts[0] == "api" else None
        if not p:
            return self.send_json({"error": "unknown project"}, 404)
        action = parts[1]
        if action == "finder":
            subprocess.run(["open", os.path.join(REPO, p["path"]) if os.path.isdir(os.path.join(REPO, p["path"]))
                            else REPO])
            return self.send_json({"ok": "opened"})
        if action == "mount" and "mount" in p and os.path.isdir(p["mount"]):
            subprocess.run(["open", p["mount"]])
            return self.send_json({"ok": "opened"})
        if action in ("start", "stop") and "server" in p:
            return self.send_json({"ok": start(p) if action == "start" else stop(p)})
        self.send_json({"error": "can't do that"}, 400)


if __name__ == "__main__":
    if "--detach" in sys.argv:   # used by the Desktop app: start in the background and return right away
        os.makedirs(LOGS, exist_ok=True)
        subprocess.Popen([sys.executable, os.path.abspath(__file__)], cwd=REPO, stdin=subprocess.DEVNULL,
                         stdout=open(os.path.join(LOGS, "server.log"), "a"), stderr=subprocess.STDOUT,
                         start_new_session=True, close_fds=True)
        sys.exit()
    print(f"80Eggs Home Base on http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
