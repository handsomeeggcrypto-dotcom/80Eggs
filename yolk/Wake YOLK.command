#!/bin/bash
# Double-click to wake YOLK on this Mac. Close this window to put YOLK to sleep.
# If she's already awake (tools/keep_awake.py keeps her running), this just opens her page.
cd "$(dirname "$0")"
if curl -s -o /dev/null --max-time 2 http://localhost:8008/api/lines; then
  open http://localhost:8008
  exit 0
fi
(sleep 1 && open http://localhost:8008) &
python3 server.py
