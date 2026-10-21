#!/bin/bash
# Double-click to wake YOLK on this Mac. Close this window to put YOLK to sleep.
cd "$(dirname "$0")"
(sleep 1 && open http://localhost:8008) &
python3 server.py
