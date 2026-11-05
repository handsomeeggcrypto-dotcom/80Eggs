#!/usr/bin/env python3
"""Keeps YOLK's server running all the time, so she's there for the Station,
the watch and SHELL without anyone pressing Wake YOLK.

  python3 yolk/tools/keep_awake.py --install     start her now and at every login
  python3 yolk/tools/keep_awake.py --restart     restart her (after changing server.py)
  python3 yolk/tools/keep_awake.py --uninstall   back to waking her by hand

A LaunchAgent runs a tiny invisible app (~/Applications/YOLK.app) that runs
server.py. If the server stops or crashes, macOS starts it again in about 10
seconds, so Home Base's Stop button works like a restart.
The app is there because macOS only lets a background job read SHELL (and the
Desktop) when an app asks; the permission goes to YOLK.app alone.
Server output: yolk/data/server.log
"""
import os
import shlex
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
DATA = HERE / "data"
LOG = DATA / "server.log"
LABEL = "com.80eggs.yolk.server"
PLIST = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
APP = Path.home() / "Applications" / "YOLK.app"
PYTHON = "/usr/bin/python3"


def build_app():
    cmd = (f"cd {shlex.quote(str(HERE.parent))} && PYTHONUNBUFFERED=1 exec {PYTHON} yolk/server.py "
           f">> {shlex.quote(str(LOG))} 2>&1")
    quoted = cmd.replace("\\", "\\\\").replace('"', '\\"')
    source = f'try\n  do shell script "{quoted}"\nend try\n'
    shutil.rmtree(APP, ignore_errors=True)
    APP.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["osacompile", "-o", str(APP), "-e", source], check=True)
    info = APP / "Contents" / "Info.plist"
    subprocess.run(["plutil", "-replace", "LSUIElement", "-bool", "true", str(info)], check=True)  # no Dock icon
    subprocess.run(["plutil", "-replace", "CFBundleIdentifier", "-string", LABEL, str(info)], check=True)
    subprocess.run(["codesign", "--force", "--sign", "-", str(APP)], check=True)


def plist_text():
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{APP}/Contents/MacOS/applet</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>{LOG}</string>
  <key>StandardErrorPath</key><string>{LOG}</string>
</dict>
</plist>
"""


def stop_hand_started():
    """A server started by Wake YOLK or Home Base holds the port; close it first."""
    pids = subprocess.run(["lsof", "-ti", "tcp:8008", "-sTCP:LISTEN"],
                          capture_output=True, text=True).stdout.split()
    for pid in pids:
        subprocess.run(["kill", pid])
    for _ in range(50):
        if not subprocess.run(["lsof", "-ti", "tcp:8008", "-sTCP:LISTEN"],
                              capture_output=True, text=True).stdout.strip():
            return
        time.sleep(0.1)


def awake(seconds=15):
    for _ in range(seconds * 2):
        try:
            urllib.request.urlopen("http://127.0.0.1:8008/api/lines", timeout=2).read()
            return True
        except Exception:
            time.sleep(0.5)
    return False


def install():
    DATA.mkdir(parents=True, exist_ok=True)
    uninstall(quiet=True)
    stop_hand_started()
    build_app()
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    PLIST.write_text(plist_text())
    subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(PLIST)], check=True)
    print("Installed. YOLK is" + (" awake" if awake() else " starting (see the log)")
          + f" and will stay that way.\nLog: {LOG}")


def restart():
    subprocess.run(["launchctl", "kickstart", "-k", f"gui/{os.getuid()}/{LABEL}"], check=True)
    print("Restarted." if awake() else f"Restarting; if she doesn't answer, see {LOG}")


def uninstall(quiet=False):
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{LABEL}"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if PLIST.exists():
        PLIST.unlink()
    if APP.exists():
        shutil.rmtree(APP)
    if not quiet:
        print("Uninstalled. Wake her with Wake YOLK or Home Base again.")


if __name__ == "__main__":
    if "--install" in sys.argv:
        install()
    elif "--restart" in sys.argv:
        restart()
    elif "--uninstall" in sys.argv:
        uninstall()
    else:
        print(__doc__)
