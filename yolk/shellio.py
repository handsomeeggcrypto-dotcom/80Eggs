"""Unplug-safe writing for SHELL (and anything else that matters).

A plain write replaces a file's contents bit by bit, so pulling SHELL's cable halfway
through leaves a broken, half-written file. Here every file is written in full to
"<name>.yolktmp" next to it, pushed all the way to the card (fsync), and only then
swapped in for the real one in a single step. A yank leaves either the old file or
the new one, never half of each; at worst a stray .yolktmp, which cleanup() removes.
"""
import os
from pathlib import Path

TMP = ".yolktmp"


def write(path, data, encoding="utf-8", errors="strict"):
    path = Path(path)
    if isinstance(data, str):
        data = data.encode(encoding, errors)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + TMP)
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def text(path, s, encoding="latin-1"):
    """Text for SHELL: latin-1 because its font (and Lua) only handle single-byte characters."""
    write(path, s, encoding, "replace")


def append(path, s, encoding="latin-1"):
    """Adds lines to the end, the safe way (rewrites the whole small file)."""
    path = Path(path)
    old = path.read_bytes() if path.exists() else b""
    write(path, old + s.encode(encoding, "replace"))


def copy(src, dst):
    write(dst, Path(src).read_bytes())


def cleanup(root):
    """Removes leftovers from a write that a yank interrupted."""
    root = Path(root)
    if not root.is_dir():
        return 0
    n = 0
    for left in list(root.rglob("*" + TMP)):
        try:
            left.unlink()
            n += 1
        except OSError:
            pass
    return n


# SHELL's own apps save the same way, as "<name>.new" then a swap (YOLK_SAVE in
# shell/root/YOLK/usb.lua). These are the files they save like that.
SHELL_SAVES = ["quests/state.txt", "hatch/state.txt", "memory.txt", "log.txt", "med/last.txt",
               "moekadex/mine.txt", "moekadex/last.txt", "dreams/mine.txt", "dreams/last.txt",
               "moto/best.txt", "moto/best_crayons.txt", "moto/best_moemoe.txt",
               "moto/best_glitch.txt", "moto/best_miami.txt"]


def recover_shell(yolk_dir):
    """Finishes a save SHELL froze in the middle of. If only the checked ".new" is left,
    it becomes the real file; if the real file is still there, the ".new" is a half
    write and goes. Same rule as YOLK_RECOVER on SHELL. Returns how many it fixed."""
    n = 0
    for rel in SHELL_SAVES:
        path = Path(yolk_dir) / rel
        new = path.with_name(path.name + ".new")
        if not new.exists():
            continue
        if path.exists():
            new.unlink()
        else:
            os.replace(new, path)
            n += 1
    return n
