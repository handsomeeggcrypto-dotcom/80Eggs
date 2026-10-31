# YOLK (`yolk/`)

YOLK is the egg AI, one character across all the user's devices. The user calls her **"she"**. She's "a little creepy, dry, affectionate" (her voice is defined in `VOICE` in `chat.py` and `brain/lines.json`). This folder is her home on the Mac: a server that the desktop terminal, the Station tablet and the iPod (SHELL) all talk to.

## Run

- `python3 yolk/server.py` → http://localhost:8008, or double-click `Wake YOLK.command`, or Home Base → Start, or the `yolk` preview config.
- **After changing `server.py`, restart the server.** The user's running copy won't pick up changes otherwise.
- It listens on `0.0.0.0` so the tablet can reach it. Anything that isn't this Mac gets only the pairing page until it enters the 6-digit code (`data/station.json`). 8 wrong tries locks pairing out for 5 minutes.

## Files

| File | What |
| --- | --- |
| `server.py` | HTTP server + SHELL sync (memory merge, dreams queue, check-in logs) + all `/api/*` endpoints |
| `static/index.html` | desktop terminal (SHELL-styled), typed chat, Moe lookup, habits |
| `static/station.html` | **the Station**, an old Galaxy Tab 4 (Android 5). **ES5 + XHR only**: no arrow functions, `fetch`, `let` or MediaRecorder. Use pre-sized images, since it blurs scaled pixel art. |
| `static/pair.html` | pairing page for new devices |
| `brain/lines.json` | YOLK's shared personality lines for every device |
| `daily.py` | **YOLK Daily**: spoken briefing (weather, reminders, Moe of the day, crypto, streaks) via macOS `say` (voice Reed) → m4a delivered to SHELL |
| `morning.py` | **morning text**: weather, reminders, her dream + oracle, streaks, crypto, sent by iMessage at `text_at` to `text_to` (both in `data/daily.json`). `~/Applications/YOLK Morning.app` does the sending (only an app may control Messages), and a LaunchAgent fires it. Run `--install` / `--uninstall`, `--test` sends one now, and no flag just prints it. Sends once a day, and never after noon if the Mac slept through the morning. |
| `ai.py` | once a day, Claude writes her dream / secret / oracle / sign-off → `data/ai/<day>.json` |
| `chat.py` | conversations: Station voice (whisper-cli → Claude) and desktop typing. Model set in `data/talk.json`. `python3 yolk/chat.py --cost` shows spend. |
| `tools/` | asset makers (faces, bell, meditation audio) + `shell_helper.py` (LaunchAgent that syncs when SHELL is plugged in) |

## Rules

- **`data/` is personal and gitignored**: the Anthropic API key (`data/anthropic_key`), the wallet address, memory, logs, habits and meditations. Never commit it, print the key or move it. If a new key is needed, the user types it via `python3 yolk/ai.py --key`.
- The crypto wallet in `data/daily.json` is a **public address only**. Never ask for a seed phrase or private key.
- Claude API: model `claude-opus-5-5` by default. The SDK is `anthropic` 0.125.0 installed with `pip --user` for `/usr/bin/python3` 3.9 (1.x needs Python 3.10+).
- Env vars `YOLK_DATA` and `YOLK_SHELL` point at test folders, so tests never touch the real data or iPod.
- Meditation days are stored in `data/meditations.txt` by local day. SHELL's check-in log uses SHELL's clock, which is right from `SHELL_CLOCK_RIGHT_FROM` in `server.py` on. The meditation streak joins both from that day, counted by day. Sessions and minutes are Station-only, since SHELL's log has no minutes. A mood of `0` means "logged a meditation, no mood yet" and is skipped in mood stats.
- YOLK's eye (Station camera) is motion-only. Nothing is stored or sent. Keep it that way.

## Ideas parked for later

The egg speaker (water-streak hum), a thermal-printer prophecy machine, a Numbers Station, smart-bulb moods. Start any of them as a software prototype here first.

Commit prefixes in use: `YOLK:`, `YOLK Station:`, `YOLK Daily:`.
