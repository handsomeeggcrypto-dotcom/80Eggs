#!/usr/bin/env python3
"""Backs up YOLK's memory once a day, so one bad day can't erase her.

  python3 yolk/backup.py           make a backup now
  python3 yolk/backup.py --list    show the backups

Copies everything personal in yolk/data (journal, memory, check-ins, meditations,
letters, plays, finance, habits, reminders, her dreams) into one zip in
iCloud Drive/YOLK Backups/, named by day. The newest KEEP stay; older ones go.
The server makes one by itself each day (see server.py), so this is only
needed by hand before something risky.

Left out on purpose:
  - the Anthropic key and YOLK.shortcut (secrets; type the key again with ai.py --key)
  - audio and the whisper model (big, and remade by daily.py / radio.py / tools)

To restore: stop her (tools/keep_awake.py --uninstall), unzip the backup over
yolk/data, then --install again.
"""
import os
import sys
import time
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = Path(os.environ.get("YOLK_DATA", HERE / "data"))
ICLOUD = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
DEST = Path(os.environ.get("YOLK_BACKUP", ICLOUD / "YOLK Backups"))
KEEP = 30

SKIP_NAMES = {"anthropic_key", "YOLK.shortcut", ".DS_Store"}
SKIP_DIRS = {"whisper", "tts", "voice_samples"}
SKIP_ENDS = (".m4a", ".wav", ".mp3", ".aiff", ".bin", ".lock")


def files():
    for path in sorted(DATA.rglob("*")):
        rel = path.relative_to(DATA)
        if not path.is_file() or rel.parts[0] in SKIP_DIRS:
            continue
        if path.name in SKIP_NAMES or path.name.endswith(SKIP_ENDS):
            continue
        yield path, rel


def today_name():
    return "yolk-%s.zip" % time.strftime("%Y-%m-%d")


def make():
    """Writes today's zip (replacing an earlier one from today) and trims old ones."""
    DEST.mkdir(parents=True, exist_ok=True)
    final = DEST / today_name()
    tmp = DEST / (final.name + ".part")
    count = 0
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for path, rel in files():
            z.write(path, str(rel))
            count += 1
    with zipfile.ZipFile(tmp) as z:          # make sure it reads back before keeping it
        bad = z.testzip()
    if bad:
        tmp.unlink()
        raise IOError("backup came out broken at " + bad)
    tmp.replace(final)
    for old in backups()[KEEP:]:
        old.unlink()
    return final, count


def backups():
    if not DEST.is_dir():
        return []
    return sorted(DEST.glob("yolk-*.zip"), reverse=True)


def daily():
    """Makes today's backup if there isn't one yet. Called by the server every hour."""
    if not (DEST / today_name()).exists():
        return make()
    return None


if __name__ == "__main__":
    if "--list" in sys.argv:
        found = backups()
        for b in found:
            print("%s  %5.0f KB" % (b.name, b.stat().st_size / 1024))
        print("%d backups in %s" % (len(found), DEST))
    else:
        where, n = make()
        print("Backed up %d files to %s" % (n, where))
