"""Shared guestbook for the Blorp Museum (blorps/index.html).

Vercel runs this as a serverless function at /api/guestbook. Entries live in
the same Upstash Redis database as the leaderboards (see api/scores.py), in a
list called gb:<book>, newest first.

  GET  /api/guestbook?book=blorps             → {"entries": [{"id", "name", "msg", "t"}, …]}
  POST /api/guestbook {"book", "name", "msg"} → {"entries": […]}

Entries show up straight away. Links are refused (that's what spam bots post).
To remove a rude entry, ask Claude: it finds the entry in gb:blorps with
LRANGE and removes that exact value with LREM.
"""
import json
import os
import random
import re
import time
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

BOOKS = {"blorps"}
SHOW = 50              # entries sent to the page
KEEP = 500             # entries kept per book
POSTS_PER_MINUTE = 3   # per visitor IP
POSTS_PER_DAY = 20     # per visitor IP
MAX_NAME = 40
MAX_MSG = 300
LINK = re.compile(r"https?:|www\.|\.(com|net|org|io|ru|xyz|link|click|top)\b|\[url|<a\s", re.I)


def redis(*commands):
    """Run Redis commands through Upstash's REST API (pipelined). Returns their results."""
    url = os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
    token = os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    if not url or not token:
        raise RuntimeError("no database connected")
    req = urllib.request.Request(
        url.rstrip("/") + "/pipeline",
        data=json.dumps([[str(a) for a in c] for c in commands]).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        out = json.loads(r.read())
    return [o.get("result") for o in out]


def entries(book):
    out = []
    for raw in redis(["LRANGE", "gb:" + book, 0, SHOW - 1])[0] or []:
        try:
            out.append(json.loads(raw))
        except Exception:
            pass
    return out


def clean(text, limit):
    # one line of plain text: no control characters, squashed spaces
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", str(text or ""))
    return re.sub(r"\s+", " ", text).strip()[:limit]


class handler(BaseHTTPRequestHandler):
    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        book = (parse_qs(urlparse(self.path).query).get("book") or [""])[0]
        if book not in BOOKS:
            return self.send_json(400, {"error": "unknown guestbook"})
        try:
            self.send_json(200, {"entries": entries(book)})
        except Exception as e:
            self.send_json(503, {"error": str(e)})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(min(n, 4000)) or b"{}")
            book, name, msg = data.get("book"), clean(data.get("name"), MAX_NAME), clean(data.get("msg"), MAX_MSG)
        except Exception:
            return self.send_json(400, {"error": "bad request"})
        if book not in BOOKS:
            return self.send_json(400, {"error": "unknown guestbook"})
        if not name or not msg:
            return self.send_json(400, {"error": "please write a name and a message"})
        if LINK.search(name + " " + msg):
            return self.send_json(400, {"error": "no links in the guestbook, sorry!"})
        ip = (self.headers.get("X-Forwarded-For") or "?").split(",")[0].strip()
        now = int(time.time())
        rl_min = "gbrl:%s:%d" % (ip, now // 60)
        rl_day = "gbrl:%s:d%d" % (ip, now // 86400)
        key = "gb:" + book
        try:
            per_min, _, per_day, _ = redis(["INCR", rl_min], ["EXPIRE", rl_min, 120],
                                           ["INCR", rl_day], ["EXPIRE", rl_day, 90000])
            if per_min > POSTS_PER_MINUTE or per_day > POSTS_PER_DAY:
                return self.send_json(429, {"error": "whoa, slow down! try again in a bit"})
            entry = {"id": "%d-%04d" % (now, random.randint(0, 9999)), "name": name, "msg": msg, "t": now}
            redis(["LPUSH", key, json.dumps(entry)], ["LTRIM", key, 0, KEEP - 1])
            self.send_json(200, {"entries": entries(book)})
        except Exception as e:
            self.send_json(503, {"error": str(e)})
