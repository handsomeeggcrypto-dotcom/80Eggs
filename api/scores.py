"""Shared high scores for the games on 81eggs.com.

Vercel runs this as a serverless function at /api/scores. Scores live in an
Upstash Redis database (added from the Vercel dashboard: Storage → Upstash),
which hands this function its URL and token as environment variables.

  GET  /api/scores?board=moto-normal          → {"top": [{"name", "score"}, …]}
  POST /api/scores {"board", "name", "score"}  → {"top": […], "rank": 3}

Each board keeps one score per name, the best one. Anyone could post a fake
score with a bit of effort; the limits below just keep it tidy.
"""
import json
import os
import re
import time
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

BOARDS = {"tomochi-classic", "tomochi-rush", "moto-normal", "moto-portal"}
MAX_SCORE = 10000000
TOP_N = 10
KEEP = 1000           # entries kept per board
POSTS_PER_MINUTE = 20  # per player IP
NAME_OK = re.compile(r"^[A-Z0-9 ._!?-]{1,12}$")


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


def top(board):
    flat = redis(["ZRANGE", "lb:" + board, 0, TOP_N - 1, "REV", "WITHSCORES"])[0] or []
    return [{"name": flat[i], "score": int(float(flat[i + 1]))} for i in range(0, len(flat), 2)]


def clean_name(name):
    name = re.sub(r"\s+", " ", str(name or "")).strip().upper()[:12]
    return name if NAME_OK.match(name) else None


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
        board = (parse_qs(urlparse(self.path).query).get("board") or [""])[0]
        if board not in BOARDS:
            return self.send_json(400, {"error": "unknown board"})
        try:
            self.send_json(200, {"top": top(board)})
        except Exception as e:
            self.send_json(503, {"error": str(e)})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(min(n, 2000)) or b"{}")
            board, name, score = data.get("board"), clean_name(data.get("name")), data.get("score")
        except Exception:
            return self.send_json(400, {"error": "bad request"})
        if board not in BOARDS:
            return self.send_json(400, {"error": "unknown board"})
        if not name:
            return self.send_json(400, {"error": "names can be letters, numbers and . _ ! ? -"})
        if not isinstance(score, int) or isinstance(score, bool) or not 0 < score <= MAX_SCORE:
            return self.send_json(400, {"error": "bad score"})
        ip = (self.headers.get("X-Forwarded-For") or "?").split(",")[0].strip()
        rl = "rl:%s:%d" % (ip, int(time.time() // 60))
        key = "lb:" + board
        try:
            count = redis(["INCR", rl], ["EXPIRE", rl, 120])[0]
            if count > POSTS_PER_MINUTE:
                return self.send_json(429, {"error": "slow down"})
            res = redis(
                ["ZADD", key, "GT", score, name],     # only ever raises a name's score
                ["ZREMRANGEBYRANK", key, 0, -KEEP - 1],
                ["ZREVRANK", key, name],
            )
            rank = res[2] + 1 if res[2] is not None else None
            self.send_json(200, {"top": top(board), "rank": rank, "name": name})
        except Exception as e:
            self.send_json(503, {"error": str(e)})
