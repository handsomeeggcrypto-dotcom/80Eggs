"""Telegram bot for 81eggs.com: type /pop and it posts Tomochi Pop.

Telegram sends every message the bot sees to this function (/api/telegram,
set once with the setWebhook link). The bot's token comes from BotFather and
lives in Vercel as TELEGRAM_BOT_TOKEN, never in this public repo.

  /pop     → menu picture + a "Play Tomochi Pop" button
  /scores  → top 5 on the Tomochi Pop leaderboards (from /api/scores) + a Play button
"""
import html
import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler

SITE = "https://www.81eggs.com"
COMMANDS = {
    "/pop": {
        "photo": SITE + "/bubbles/assets/menu/menu_01.jpg",
        "caption": "🫧 Tomochi Pop! Pop the bubbles, rescue your friends, earn hamstars.",
        "button": "▶ Play Tomochi Pop",
        "url": SITE + "/bubbles/",
    },
}

# /scores: one section per leaderboard. The bot is for the Tomochi Pop group,
# so only Tomochi Pop's boards (api/scores.py also has MOEtorcycles').
BOARDS = [
    ("tomochi-classic", "🫧 Classic"),
    ("tomochi-rush", "⚡ Rush"),
]
SCORES_SHOWN = 5
MEDALS = ["🥇", "🥈", "🥉"]


def board_top(board):
    with urllib.request.urlopen(SITE + "/api/scores?board=" + board, timeout=4) as r:
        return json.loads(r.read()).get("top") or []


def scores_text():
    parts = ["🏆 <b>TOMOCHI POP LEADERBOARDS</b>"]
    for board, title in BOARDS:
        lines = ["", "<b>%s</b>" % title]
        try:
            top = board_top(board)[:SCORES_SHOWN]
        except Exception:
            top = None
        if top is None:
            lines.append("  (couldn't load)")
        elif not top:
            lines.append("  No scores yet. Be the first!")
        for i, row in enumerate(top or []):
            mark = MEDALS[i] if i < len(MEDALS) else "%d." % (i + 1)
            lines.append("%s %s  <b>%s</b>" % (mark, html.escape(row["name"]), "{:,}".format(row["score"])))
        parts += lines
    return "\n".join(parts)


def telegram(method, payload):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("no TELEGRAM_BOT_TOKEN")
    req = urllib.request.Request(
        "https://api.telegram.org/bot%s/%s" % (token, method),
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())


def command_of(text):
    """'/pop', '/pop@TomochiPopBot' and '/POP hi' all count as '/pop'."""
    word = (text or "").strip().split(" ")[0]
    return word.split("@")[0].lower()


class handler(BaseHTTPRequestHandler):
    def reply(self, code=200):
        # Telegram only needs a 200, or it keeps retrying the same message
        self.send_response(code)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"Tomochi Pop bot is here. Talk to it on Telegram.")

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            update = json.loads(self.rfile.read(min(n, 20000)) or b"{}")
            msg = update.get("message") or update.get("channel_post") or {}
            word = command_of(msg.get("text"))
            cmd = COMMANDS.get(word)
            if word == "/scores":
                telegram("sendMessage", {
                    "chat_id": msg["chat"]["id"],
                    "text": scores_text(),
                    "parse_mode": "HTML",
                    "reply_markup": {"inline_keyboard": [[
                        {"text": "▶ Play Tomochi Pop", "url": SITE + "/bubbles/"},
                    ]]},
                })
            elif cmd:
                telegram("sendPhoto", {
                    "chat_id": msg["chat"]["id"],
                    "photo": cmd["photo"],
                    "caption": cmd["caption"],
                    "reply_markup": {"inline_keyboard": [[{"text": cmd["button"], "url": cmd["url"]}]]},
                })
        except Exception as e:
            print("telegram bot error:", e)
        self.reply()
