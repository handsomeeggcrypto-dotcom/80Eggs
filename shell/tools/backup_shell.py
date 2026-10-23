#!/usr/bin/env python3
"""Copies everything that only lives on SHELL to the Mac.

  python3 tools/backup_shell.py [/Volumes/SHELL]

Lands in shell/backup/<date-time>/ (git-ignored: it's personal) and records
that folder in shell/backup/latest.txt for restore_shell.py.

Skipped because the Mac already has them or they're rebuilt: Music
(Desktop/Classic Ipod), iPod_Control (the old Apple library, also in
Classic Ipod), Photos (moekedex/ipod_photos), and the Moekadex / Dream Things
pictures (tools/gen_moekadex.py, tools/gen_dreams.py).
"""
import datetime as dt
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKUPS = HERE.parent / "backup"
SKIP = ["Music/", "iPod_Control/", "Photos/", "YOLK/moekadex/img/", "YOLK/dreams/img/",
        ".Trashes/", ".fseventsd/", ".Spotlight-V100/", "._*", ".DS_Store"]


def backup(volume):
    volume = Path(volume)
    if not (volume / ".rockbox").is_dir():
        sys.exit(f"{volume} doesn't look like SHELL (no .rockbox folder). Is she plugged in?")
    dest = BACKUPS / dt.datetime.now().strftime("%Y-%m-%d_%H%M")
    dest.mkdir(parents=True, exist_ok=True)
    cmd = ["rsync", "-rt", "--modify-window=1"] + [f"--exclude={s}" for s in SKIP] + [f"{volume}/", f"{dest}/"]
    subprocess.run(cmd, check=True)
    (BACKUPS / "latest.txt").write_text(dest.name + "\n")
    files = [p for p in dest.rglob("*") if p.is_file()]
    size = sum(p.stat().st_size for p in files)
    print(f"backed up {len(files)} files ({size / 1e6:.0f} MB) to {dest}")
    for important in ["YOLK/memory.txt", "YOLK/log.txt", ".rockbox/config.cfg", ".rockbox/rocks/plugin.dat"]:
        print(("  ok      " if (dest / important).exists() else "  missing ") + important)
    return dest


if __name__ == "__main__":
    backup(sys.argv[1] if len(sys.argv) > 1 else "/Volumes/SHELL")
