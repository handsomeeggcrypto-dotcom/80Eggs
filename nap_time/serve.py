#!/usr/bin/env python3
"""Dev server for Nap Time that disables caching (so JS edits show up on reload)."""
import http.server, socketserver, os

PORT = 8177
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


Handler.extensions_map.update({".js": "application/javascript"})
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print("Nap Time dev server (no-cache) on http://localhost:%d" % PORT)
    httpd.serve_forever()
