#!/usr/bin/env python3
"""Rebuilds SHELL onto a fresh drive (the iFlash SD card) in one go.

  python3 tools/restore_shell.py /Volumes/<card> [--dry-run]

The card must already be in the iPod and formatted through Apple's disk mode. Do NOT
format it in a card reader or erase the whole disk: bootloader 1.0 then says "No
partition found". Boot into disk mode once (Apple writes its own partition table), then
  diskutil eraseVolume "MS-DOS FAT32" SHELL diskNs1
which must leave the partition at block 63 (258048 bytes) in disk mode's view.
Run this restore in disk mode too.
Nothing is ever erased: files are only added or replaced. In order:

  1. Rockbox itself + fonts      the exact build SHELL ran (tools/cache/rockbox)
  2. SHELL OS                    theme, YOLK, apps, art (shell/root), rebuilding
                                 Moekadex / Dream Things pictures if missing
  3. your SHELL                  settings, boot animation, scores, notes... from
                                 the latest backup (tools/backup_shell.py)
  4. music                       the songs you picked (Desktop/Classic Ipod)
  5. YOLK                        newest memory, check-ins, dreams, YOLK Daily,
                                 meditation sessions, from the Mac's YOLK brain

The bootloader lives in SHELL's own flash chip, not on the drive, so it
survives the swap and isn't touched here.
"""
import json
import os
import plistlib
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHELL_DIR = HERE.parent
ROOT = SHELL_DIR / "root"
CACHE = HERE / "cache" / "rockbox"
BACKUPS = SHELL_DIR / "backup"
LIBRARY = Path.home() / "Desktop" / "Classic Ipod" / "Library"
PICKS = LIBRARY.parent / "shell_picks.json"
YOLK = Path.home() / "80Eggs" / "yolk"
ROCKBOX_ZIPS = ["rockbox-ipod6g-20261021.zip", "rockbox-fonts-20261021.zip"]

DRY = "--dry-run" in sys.argv


def step(n, title):
    print(f"\n[{n}/5] {title}")


def run(cmd):
    print("   $ " + " ".join(str(c) for c in cmd))
    if not DRY:
        subprocess.run([str(c) for c in cmd], check=True)


def rsync(src, dst, excludes=()):
    run(["rsync", "-rt", "--modify-window=1"] + [f"--exclude={e}" for e in excludes] + [f"{src}/", f"{dst}/"])


def check_target(target):
    if not target.is_dir():
        sys.exit(f"{target} isn't mounted. Plug in the card (or SHELL) and try again.")
    info = plistlib.loads(subprocess.run(["diskutil", "info", "-plist", str(target)],
                                         capture_output=True, check=True).stdout)
    fs = (info.get("FilesystemType") or info.get("FilesystemName") or "").lower()
    if fs not in ("msdos", "ms-dos (fat32)", "ms-dos fat32"):
        sys.exit(f"{target} is '{fs or 'unknown'}', not FAT32. Format it as MS-DOS (FAT) with "
                 "Master Boot Record in Disk Utility first (Rockbox can't use exFAT or Mac formats).")
    free = shutil.disk_usage(target).free
    total = info.get("TotalSize") or info.get("Size") or 0
    print(f"target: {target}  ({fs}, {total / 1e9:.0f} GB, {free / 1e9:.0f} GB free)")
    if total > 137e9:
        print("   note: Apple's software on this iPod only sees 128GB; Rockbox is fine with more.")
    return free


def generated_art():
    """Moekadex / Dream Things pictures aren't in git; rebuild them if they're missing."""
    for name, script in [("moekadex", "gen_moekadex.py"), ("dreams", "gen_dreams.py")]:
        img = ROOT / "YOLK" / name / "img"
        if not img.is_dir() or sum(1 for _ in img.rglob("*.bmp")) < 5000:
            print(f"   {name} pictures missing, rebuilding (this downloads them again)...")
            run([sys.executable, HERE / script])


def latest_backup():
    f = BACKUPS / "latest.txt"
    if not f.exists():
        return None
    d = BACKUPS / f.read_text().strip()
    return d if d.is_dir() else None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    target = Path(args[0])
    free = check_target(target)
    if DRY:
        print("dry run: showing what would happen, changing nothing")

    step(1, "Rockbox + fonts")
    for z in ROCKBOX_ZIPS:
        path = CACHE / z
        if not path.exists():
            sys.exit(f"missing {path}: it was saved when SHELL was set up; see tools/cache/rockbox")
        print(f"   unzip {z}")
        if not DRY:
            zipfile.ZipFile(path).extractall(target)

    step(2, "SHELL OS (theme, YOLK, apps)")
    generated_art()
    rsync(ROOT, target, excludes=["YOLK/memory.txt", "YOLK/log.txt", "YOLK/*/last.txt", "YOLK/moto/best.txt"])
    # theme as the default, in case there's no backup to bring settings from
    if not DRY and not (target / ".rockbox" / "config.cfg").exists():
        shutil.copy(ROOT / ".rockbox" / "themes" / "yolk.cfg", target / ".rockbox" / "config.cfg")

    step(3, "your SHELL (settings, boot animation, scores, notes)")
    b = latest_backup()
    if b:
        print(f"   from backup {b.name}")
        # everything personal; Rockbox's own program files came fresh in step 1
        rsync(b, target, excludes=[".rockbox/codecs/", ".rockbox/rocks/*.rock", ".rockbox/rocks/*/*.rock",
                                   ".rockbox/fonts/", ".rockbox/rockbox.ipod"])
    else:
        print("   no backup found (run tools/backup_shell.py first); SHELL starts fresh with the YOLK theme")

    step(4, "music")
    picks = json.loads(PICKS.read_text(encoding="utf-8")) if PICKS.exists() else []
    if picks:
        need = sum((LIBRARY / p).stat().st_size for p in picks if (LIBRARY / p).exists())
        print(f"   {len(picks)} songs, {need / 1e9:.1f} GB")
        if need > free:
            sys.exit("   not enough space on the card for the music")
        lst = SHELL_DIR / "tools" / "cache" / "picks.txt"
        lst.parent.mkdir(parents=True, exist_ok=True)
        lst.write_text("".join(p[len("Music/"):] + "\n" for p in picks if p.startswith("Music/")), encoding="utf-8")
        run(["rsync", "-rt", "--modify-window=1", f"--files-from={lst}", f"{LIBRARY / 'Music'}/", f"{target / 'Music'}/"])
    else:
        print(f"   no song picks at {PICKS}; skipping")

    step(5, "YOLK (memory, check-ins, dreams, YOLK Daily, meditation)")
    # meditation sounds aren't in git either; make them if missing (daily.deliver() copies them)
    for script, folder, count in [("make_meditation_audio.py", "med", 6),
                                  ("make_meditation_sessions.py", "sessions", 35)]:
        d = YOLK / "static" / "sounds" / folder
        if not d.is_dir() or len(list(d.glob("*.m4a"))) < count:
            print(f"   meditation {folder} missing, making them (a few minutes)...")
            run([sys.executable, YOLK / "tools" / script])
    if not DRY:
        env = dict(os.environ, YOLK_SHELL=str(target / "YOLK"))
        subprocess.run([sys.executable, "-c",
                        "import server, daily\n"
                        "server.deliver_daily = lambda: None\n"
                        "mem, ok = server.sync()\n"
                        "daily.SHELL = __import__('pathlib').Path(server.SHELL).parent\n"
                        "if daily.needs_build(): daily.build()\n"
                        "print('   yolk synced:', ok, '| daily delivered:', daily.deliver())"],
                       cwd=YOLK, env=env, check=True)
    else:
        print("   would merge the Mac's YOLK memory/check-ins and deliver YOLK Daily")

    if not DRY:
        subprocess.run(["dot_clean", "-m", str(target)], check=False)   # drop macOS ._ clutter
        subprocess.run(["sync"], check=False)
    print("\nchecks:")
    for p in [".rockbox/rockbox.ipod", ".rockbox/config.cfg", ".rockbox/rocks/plugin.dat",
              ".rockbox/fonts/16-Terminus.fnt", "YOLK/boot.lua", "YOLK/talk.lua", "YOLK/memory.txt"]:
        print(("   ok      " if (target / p).exists() else "   MISSING ") + p)
    for name in ["moekadex", "dreams"]:
        n = sum(1 for _ in (target / "YOLK" / name / "img").rglob("[0-9]*.bmp")) if (target / "YOLK" / name / "img").is_dir() else 0
        print(f"   {name} pictures: {n}")
    music = sum(1 for p in (target / "Music").rglob("*") if p.is_file() and not p.name.startswith("._")) if (target / "Music").is_dir() else 0
    print(f"   music files: {music}")
    print("\ndone. eject her and restart (Menu + Select): SHELL should boot straight into YOLK.")


if __name__ == "__main__":
    main()
