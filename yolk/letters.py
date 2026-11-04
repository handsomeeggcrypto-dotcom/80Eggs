#!/usr/bin/env python3
"""Letters between you and YOLK, by way of SHELL.

On SHELL you spell a letter with the click wheel ("letters" in Talk to YOLK).
It waits in /YOLK/letters/out.txt until SHELL is plugged in. Then the Mac
files it, Claude writes her reply, anything worth keeping goes in her shared
memory (journal.py), and the reply is waiting on SHELL when you unplug.

  python3 yolk/letters.py        every letter, both ways

data/letters.txt, one per line:  unix time|you or yolk|letter id|text
(her reply has the id of the letter it answers). On SHELL:
  /YOLK/letters/out.txt   time|text        written by SHELL, emptied by the Mac
  /YOLK/letters/in.txt    id|part          her last few replies, cut to fit the screen
"""
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402

LETTERS = server.DATA / "letters.txt"
KEEP_ON_SHELL = 5     # her newest replies kept on SHELL
PART = 100            # characters per screen on SHELL

_lock = threading.Lock()
_writing = threading.Lock()


def read():
    out = []
    if LETTERS.exists():
        for line in LETTERS.read_text(encoding="utf-8").splitlines():
            p = line.split("|", 3)
            if len(p) == 4 and p[0].isdigit() and p[2].isdigit():
                out.append({"t": int(p[0]), "from": p[1], "id": int(p[2]), "text": p[3]})
    return out


def _add(t, who, lid, text):
    LETTERS.parent.mkdir(parents=True, exist_ok=True)
    text = " ".join(str(text).replace("|", " ").split())
    with open(LETTERS, "a", encoding="utf-8") as f:
        f.write(f"{int(t)}|{who}|{lid}|{text}\n")


def collect(shell):
    """Files any letters written on SHELL and clears its outbox. Returns how many were new."""
    box = shell / "letters" / "out.txt"
    if not box.exists():
        return 0
    lines = [l for l in box.read_text(encoding="latin-1").splitlines() if l.strip()]
    with _lock:
        have = read()
        seen = {(l["t"], l["text"]) for l in have if l["from"] == "you"}
        next_id = max([l["id"] for l in have] + [0]) + 1
        new = 0
        for line in lines:
            t, _, text = line.partition("|")
            text = " ".join(text.replace("|", " ").split())
            if not t.isdigit() or not text or (int(t), text) in seen:
                continue
            _add(t, "you", next_id, text)
            seen.add((int(t), text))
            next_id += 1
            new += 1
    box.write_text("", encoding="latin-1")
    return new


def unanswered():
    letters = read()
    answered = {l["id"] for l in letters if l["from"] == "yolk"}
    return [l for l in letters if l["from"] == "you" and l["id"] not in answered]


def answer_pending(shell=None):
    """Claude writes her replies; delivered to SHELL right away if it's still plugged in."""
    if not _writing.acquire(blocking=False):
        return
    try:
        import chat
        import journal
        for letter in unanswered():
            try:
                reply = chat.letter_reply(letter["text"])
            except Exception as e:
                print("YOLK couldn't write back:", e)
                return
            with _lock:
                _add(time.time(), "yolk", letter["id"], reply)
            try:
                journal.take_notes([{"role": "user", "content": "(a letter, written on SHELL) " + letter["text"]},
                                    {"role": "assistant", "content": reply}], "shell")
            except Exception as e:
                print("YOLK couldn't write in her journal:", e)
        if shell is not None and shell.is_dir():
            deliver(shell)
    finally:
        _writing.release()


def split(text, n=PART):
    """Cuts a reply into screen-sized pieces, at word breaks."""
    parts, cur = [], ""
    for word in text.split():
        if cur and len(cur) + 1 + len(word) > n:
            parts.append(cur)
            cur = word
        else:
            cur = (cur + " " + word).strip()
    if cur:
        parts.append(cur)
    return parts


def deliver(shell):
    replies = [l for l in read() if l["from"] == "yolk"][-KEEP_ON_SHELL:]
    (shell / "letters").mkdir(parents=True, exist_ok=True)
    text = "".join(f"{r['id']}|{p}\n" for r in replies for p in split(r["text"]))
    (shell / "letters" / "in.txt").write_text(text, encoding="latin-1", errors="replace")


def on_sync(shell):
    """Called by server.sync() whenever SHELL is plugged in."""
    collect(shell)
    deliver(shell)
    if unanswered():
        threading.Thread(target=answer_pending, args=(shell,), daemon=True).start()


if __name__ == "__main__":
    for l in read():
        print(time.strftime("%b %d %H:%M", time.localtime(l["t"])), f"#{l['id']}", l["from"].upper() + ":", l["text"])
    if not LETTERS.exists():
        print("no letters yet")
