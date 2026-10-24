#!/usr/bin/env python3
"""Gets YOLK's deliveries onto SHELL when she's plugged in, even with the server closed.

  python3 yolk/tools/shell_helper.py              do one delivery now (if SHELL is here)
  python3 yolk/tools/shell_helper.py --install    start the Mac helper (runs at every login)
  python3 yolk/tools/shell_helper.py --uninstall  stop it and remove it

The helper is a LaunchAgent: whenever a disk is mounted, macOS opens a tiny invisible
app (~/Applications/YOLK Helper.app) that runs this script. The app is what gets
permission to read SHELL, so no other Python script does.
It does what the server's sync does: merges memory + check-ins, hands over dreams,
builds YOLK Daily if it's stale, then copies it and the meditation tracks to SHELL.
If the server is running it just asks the server to sync, so only one of them
ever writes to SHELL. Safe to run any number of times. Log: yolk/data/shell_helper.log
"""
import fcntl
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

DATA = HERE / "data"
LOG = DATA / "shell_helper.log"
LOCK = DATA / "shell_helper.lock"
SHELL_YOLK = Path("/Volumes/SHELL/YOLK")
LABEL = "com.80eggs.yolk.shellhelper"
PLIST = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
APP = Path.home() / "Applications" / "YOLK Helper.app"
SERVER = "http://127.0.0.1:8008"


def log(msg):
    DATA.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {msg}\n")


def wait_for_shell(seconds=15):
    """A freshly mounted disk can take a moment to show its folders."""
    for _ in range(seconds):
        if SHELL_YOLK.is_dir():
            return True
        time.sleep(1)
    return SHELL_YOLK.is_dir()


def server_running():
    try:
        urllib.request.urlopen(SERVER + "/api/lines", timeout=3).read()
        return True
    except Exception:
        return False


def run():
    if not Path("/Volumes/SHELL").exists():
        return                              # some other disk was mounted; nothing to do
    if not wait_for_shell():
        log("SHELL is mounted but has no YOLK folder; skipped")
        return
    DATA.mkdir(parents=True, exist_ok=True)
    with open(LOCK, "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log("another delivery is already running; skipped")
            return
        if server_running():
            # the server syncs (and delivers) on /api/state; let it be the only writer
            urllib.request.urlopen(SERVER + "/api/state", timeout=30).read()
            log("server is running; asked it to sync")
            return
        import server
        import daily
        server.deliver_daily = lambda: None     # its background thread would die with us; done below
        _, connected = server.sync()
        if not connected:
            log("SHELL went away before syncing")
            return
        built = False
        if daily.needs_build():
            daily.build()
            built = True
        copied = daily.deliver()
        log(f"synced memory + check-ins; YOLK Daily {'built and ' if built else ''}"
            f"{'copied' if copied else 'not copied'} ({daily.target_day()}); meditation checked")


def build_app():
    """macOS only lets a background job read SHELL if an app asks for it, so the
    helper runs inside a tiny invisible app. Permission is granted to that app alone."""
    import shlex
    import shutil
    cmd = f"{shlex.quote(sys.executable)} {shlex.quote(str(Path(__file__).resolve()))}"
    source = f'try\n  do shell script "{cmd.replace(chr(92), chr(92) * 2).replace(chr(34), chr(92) + chr(34))}"\nend try\n'
    shutil.rmtree(APP, ignore_errors=True)
    APP.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["osacompile", "-o", str(APP), "-e", source], check=True)
    info = APP / "Contents" / "Info.plist"
    subprocess.run(["plutil", "-replace", "LSUIElement", "-bool", "true", str(info)], check=True)  # no Dock icon
    subprocess.run(["plutil", "-replace", "CFBundleIdentifier", "-string", LABEL, str(info)], check=True)
    subprocess.run(["codesign", "--force", "--sign", "-", str(APP)], check=True)


def plist_text():
    out = DATA / "shell_helper.out"
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
  <key>StartOnMount</key><true/>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>{out}</string>
  <key>StandardErrorPath</key><string>{out}</string>
</dict>
</plist>
"""


def install():
    DATA.mkdir(parents=True, exist_ok=True)
    uninstall(quiet=True)
    build_app()
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    PLIST.write_text(plist_text())
    subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(PLIST)], check=True)
    log("helper installed")
    print(f"Installed. SHELL will get her deliveries whenever she's plugged in.\nLog: {LOG}")


def uninstall(quiet=False):
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{LABEL}"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if PLIST.exists():
        PLIST.unlink()
    if APP.exists():
        import shutil
        shutil.rmtree(APP)
    if not quiet:
        log("helper uninstalled")
        print("Uninstalled. Deliveries only happen through the YOLK server again.")


if __name__ == "__main__":
    if "--install" in sys.argv:
        install()
    elif "--uninstall" in sys.argv:
        uninstall()
    else:
        try:
            run()
        except PermissionError as e:
            log(f"macOS blocked SHELL ({e.strerror}): allow YOLK Helper under System Settings > "
                "Privacy & Security > Files & Folders > Removable Volumes")
            raise
        except Exception as e:
            log(f"failed: {e!r}")
            raise
