#!/bin/bash
# Double-click to open 80Eggs Home Base. Close this window to shut it down.
cd "$(dirname "$0")"
(sleep 1 && open http://localhost:8090) &
python3 server.py
