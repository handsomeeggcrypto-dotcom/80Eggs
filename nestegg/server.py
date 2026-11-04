#!/usr/bin/env python3
"""Nest Egg: practice crypto bots trading SOL with fake money.

  python3 nestegg/server.py   -> http://localhost:8121 (this Mac only)

Every minute it fetches the newest SOL price and lets each bot trade its fake $1,000.
Once a day it re-runs the backtest. The memecoin bots (memes.py) run in their own loop every 30 seconds. Nothing here holds a wallet or can make a real trade.
"""
import json
import os
import subprocess
import sys
import threading
import time
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import engine
import memes

PORT = 8121
latest = {"paper": None, "backtest": engine.load(engine.BACKTEST, None), "error": None, "checked": None,
          "memes": None, "memesError": None}


def tick():
    candles = engine.update_candles()
    latest["paper"] = engine.paper_report(engine.paper(candles), candles)
    bt = latest["backtest"]
    if not bt or time.time() - bt["made"] > 86400:
        latest["backtest"] = engine.backtest(candles)
        engine.save(engine.BACKTEST, latest["backtest"])
    latest["error"], latest["checked"] = None, int(time.time())


def loop():
    while True:
        try:
            tick()
        except Exception as e:      # no internet, Coinbase hiccup: keep the old numbers and try again
            latest["error"] = str(e)
            traceback.print_exc()
        time.sleep(60)


def meme_loop():
    """Memecoins move fast: check open positions every 30 seconds, look for new coins every 2 minutes."""
    st = memes.load()
    while True:
        try:
            memes.tick(st)
            latest["memesError"] = None
        except Exception as e:
            latest["memesError"] = str(e)
            traceback.print_exc()
        latest["memes"] = memes.report(st)
        time.sleep(30)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=engine.HERE, **k)

    def do_GET(self):
        if self.path.startswith("/api/data"):
            body = json.dumps(latest).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
        elif self.path.split("?")[0] in ("/", "/index.html"):
            self.path = "/index.html"
            super().do_GET()
        else:
            self.send_error(404)     # don't serve data/ or the code

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


LABEL = "com.80eggs.nestegg"
PLIST = os.path.expanduser("~/Library/LaunchAgents/%s.plist" % LABEL)


def install():
    """Start Nest Egg at login and restart it if it ever stops."""
    uninstall()
    os.makedirs(engine.DATA, exist_ok=True)
    out = os.path.join(engine.DATA, "server.log")
    with open(PLIST, "w") as f:
        f.write("""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>%s</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/python3</string><string>%s</string></array>
  <key>WorkingDirectory</key><string>%s</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>%s</string>
  <key>StandardErrorPath</key><string>%s</string>
</dict>
</plist>
""" % (LABEL, os.path.abspath(__file__), engine.HERE, out, out))
    subprocess.run(["launchctl", "bootstrap", "gui/%d" % os.getuid(), PLIST], check=True)
    print("Installed. Nest Egg now runs in the background, even after a restart.\nLog: " + out)


def uninstall():
    subprocess.run(["launchctl", "bootout", "gui/%d/%s" % (os.getuid(), LABEL)],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(PLIST):
        os.remove(PLIST)


if __name__ == "__main__":
    if "--install" in sys.argv:
        install()
        sys.exit()
    if "--uninstall" in sys.argv:
        uninstall()
        print("Uninstalled. Nest Egg only runs when started from Home Base again.")
        sys.exit()
    threading.Thread(target=loop, daemon=True).start()
    threading.Thread(target=meme_loop, daemon=True).start()
    print("Nest Egg on http://localhost:%d" % PORT)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
