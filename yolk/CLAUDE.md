# YOLK (`yolk/`)

YOLK is the egg AI, one character across all the user's devices. The user calls her **"she"**. She's "a little creepy, dry, affectionate" (her voice is defined in `VOICE` in `chat.py` and `brain/lines.json`). This folder is her home on the Mac: a server that the desktop terminal, the Station tablet and the iPod (SHELL) all talk to.

## Run

- **She's always on** (since 2026-11-05): `tools/keep_awake.py --install` made a LaunchAgent (`com.80eggs.yolk.server`) that runs `~/Applications/YOLK.app`, which runs `server.py`, at login and again ~10s after any stop or crash. Output goes to `data/server.log`. The app exists so macOS gives *it* permission to read SHELL and the Desktop. `--uninstall` goes back to waking her by hand.
- By hand (if uninstalled): `python3 yolk/server.py` → http://localhost:8008, `Wake YOLK.command` (just opens her page if she's already up), Home Base → Start, or the `yolk` preview config.
- **After changing `server.py`, restart her:** `python3 yolk/tools/keep_awake.py --restart` (Home Base's Stop also works as a restart now). Her running copy won't pick up changes otherwise.
- It listens on `0.0.0.0` so the tablet can reach it. Anything that isn't this Mac gets only the pairing page until it enters the 6-digit code (`data/station.json`). 8 wrong tries locks pairing out for 5 minutes.

## Files

| File | What |
| --- | --- |
| `server.py` | HTTP server + SHELL sync (memory merge, dreams queue, check-in logs) + all `/api/*` endpoints. The merge is three-way against `data/memory_synced.txt`, so changes on either side survive and counters add up |
| `journal.py` | **her shared memory**: after a chat goes quiet for 2 minutes (or a new one starts), Haiku writes notes worth keeping to `data/journal.txt` (with the date when a note is about a certain day) and crosses out stale ones. Every new chat on the Mac or Station reads them, and the newest 15 go to SHELL as `/YOLK/remember.txt` on sync. "what do you remember?" on the desktop terminal and on SHELL shows them; the terminal can forget one. `python3 yolk/journal.py` lists them, `--forget <id>` removes one |
| `letters.py` | **letters by way of SHELL**: you spell one on SHELL (Talk to YOLK → letters), it waits in `/YOLK/letters/out.txt`; on sync the Mac files it in `data/letters.txt`, Claude writes her reply (`chat.letter_reply`), the journal takes notes, and the reply goes to `/YOLK/letters/in.txt` cut into screen-sized parts. `python3 yolk/letters.py` lists them all |
| `music.py` | **what you play on SHELL**: on sync, new lines of SHELL's `/.rockbox/playback.log` (switched on by the HATCHERY, only ever read) go to `data/plays.txt`. From the last week she knows top songs, artists, skips and after-midnight plays: a line in chat (`for_chat`), remarks for SHELL in `/YOLK/music.txt`, and YOLK Radio picks about every third song from your top artists and may tease your most played. `python3 yolk/music.py` shows the week |
| `static/index.html` | desktop terminal (SHELL-styled), typed chat, Moe lookup, habits |
| `static/station.html` | **the Station**, an old Galaxy Tab 4 (Android 5). **ES5 + XHR only**: no arrow functions, `fetch`, `let` or MediaRecorder. Use pre-sized images, since it blurs scaled pixel art. |
| `static/pair.html` | pairing page for new devices |
| `brain/lines.json` | YOLK's shared personality lines for every device |
| `daily.py` | **YOLK Daily**: spoken briefing (weather, reminders, Moe of the day, crypto, streaks) via macOS `say` (voice Reed) → m4a delivered to SHELL |
| `morning.py` | **morning text**: weather, reminders, her dream + oracle, streaks, crypto, sent by iMessage at `text_at` to `text_to` (both in `data/daily.json`). `~/Applications/YOLK Morning.app` does the sending (only an app may control Messages), and a LaunchAgent fires it. Run `--install` / `--uninstall`, `--test` sends one now, and no flag just prints it. Sends once a day, and never after noon if the Mac slept through the morning. |
| `backup.py` | **her backups**: once a day the server zips everything personal in `data/` (not the API key, `YOLK.shortcut`, audio or the whisper model) to `iCloud Drive/YOLK Backups/yolk-<day>.zip`, keeping the newest 30. `python3 yolk/backup.py` makes one now, `--list` shows them. Restore = uninstall keep_awake, unzip over `data/`, install again. Test runs with `YOLK_DATA` skip it unless `YOLK_BACKUP` is set |
| `nudge.py` | **she texts first, now and then**: the server checks every 10 minutes and sends at most one iMessage a day (11am to 9:30pm, not within 2 hours of a chat, ordinary reasons only every 2+ days). Reasons: a journal note about tomorrow, a meditation streak about to break (evenings), 4 quiet days, a song on repeat on SHELL, or sometimes just something she remembers. `chat.text_message` writes it (~1 cent); the server sends it via `osascript`, so macOS asks once whether **YOLK** may control Messages. Log `data/nudges.txt`; chats see her recent texts. `python3 yolk/nudge.py` shows her reasons, `--write` drafts one without sending, `--log` lists sent ones, `--test` sends one now through the server (`POST /api/nudge/test`, this Mac only). First test went out 2026-11-05. Off: `"nudges": false` in `data/daily.json`. Her texts are logged in `talk_cost.txt` with an 8th field `text`, so they don't count as talking |
| `ai.py` | once a day, Claude writes her dream / secret / oracle / sign-off → `data/ai/<day>.json` |
| `finance.py` | Finance Tracker's numbers: page at `/finance` (`static/finance.html`, this Mac only), saved in `data/finance.json`, summary to SHELL on sync. SHELL's wheel code is in `data/finance_code.txt`. |
| `radio.py` | **YOLK Radio**: a daily show of the user's songs with spoken intros, delivered to `Music/YOLK Radio/` + `/YOLK/radio/`. `ai.weekly()` writes the weekly note, `/YOLK/review.txt` on SHELL. |
| `chat.py` | conversations: Station voice (whisper-cli → Claude) and desktop typing. Model set in `data/talk.json`. `python3 yolk/chat.py --cost` shows spend. |
| **Apple Watch** | a Shortcut, not an app. `tools/make_watch_shortcut.py` builds and signs `data/YOLK.shortcut` (gitignored, holds the key): ask for text → POST to `/api/watch` with header `X-YOLK-Key`, or to `/api/watch/<key>` (what the hand-built one uses; `watch_key` in `data/station.json`) → show her reply. The key opens only that one endpoint. Chat place is `watch` (short replies). Home Wi-Fi only, since it talks to `<LocalHostName>.local:8008`. Neither the imported nor the hand-built Shortcut reached the watch (the watch gets no user shortcuts at all; only Apple's starters), though it works on the iPhone. **So the watch uses `/w/<key>`**, a no-JavaScript chat page (`watch_page` in `server.py`) opened from a link the user texted themselves; the watch's web view shows it. A real watchOS app needs Xcode (not installed) |
| `tools/` | asset makers (faces, bell, meditation audio) + `shell_helper.py` (LaunchAgent that syncs when SHELL is plugged in) + `keep_awake.py` (keeps the server running) |

## Rules

- **`data/` is personal and gitignored**: the Anthropic API key (`data/anthropic_key`), the wallet address, memory, logs, habits and meditations. Never commit it, print the key or move it. If a new key is needed, the user types it via `python3 yolk/ai.py --key`.
- The crypto wallet in `data/daily.json` is a **public address only**. Never ask for a seed phrase or private key.
- Claude API: model `claude-opus-5-5` by default. The SDK is `anthropic` 0.125.0 installed with `pip --user` for `/usr/bin/python3` 3.9 (1.x needs Python 3.10+).
- Env vars `YOLK_DATA` and `YOLK_SHELL` point at test folders, so tests never touch the real data or iPod.
- Meditation days are stored in `data/meditations.txt` by local day. SHELL's check-in log uses SHELL's clock, which is right from `SHELL_CLOCK_RIGHT_FROM` in `server.py` on. The meditation streak joins both from that day, counted by day. SHELL's sessions and minutes are copied from `/YOLK/med/sessions.txt` to `data/shell_meditations.txt` on sync; the minutes are the length picked, logged at the start. A mood of `0` means "logged a meditation, no mood yet" and is skipped in mood stats.
- YOLK's eye (Station camera) is motion-only. Nothing is stored or sent. Keep it that way.

## Ideas parked for later

The egg speaker (water-streak hum), a thermal-printer prophecy machine, a Numbers Station, smart-bulb moods. Start any of them as a software prototype here first.

Commit prefixes in use: `YOLK:`, `YOLK Station:`, `YOLK Daily:`.
