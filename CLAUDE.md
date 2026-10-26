# 80Eggs

The user's personal site and everything they build with Claude. Live at **https://www.81eggs.com**.

- GitHub: `handsomeeggcrypto-dotcom/80Eggs`. **The repo is PUBLIC.** Never commit secrets, API keys, wallet details, photos or personal logs.
- **Pushing `main` deploys the live site** (Vercel builds it in about 30 seconds). Commit freely, but only push when the user says to.
- Everything is static HTML/JS with no build step, so the site is just this folder.

## Projects

Each project folder has its own `CLAUDE.md`. Read it before working there.

| Folder / file | What it is | Status |
| --- | --- | --- |
| `index.html` | **MoeSpace**, the homepage (a MySpace parody) | live |
| `bubbles/` | **Tomochi Pop** bubble shooter (folder name kept from "Bubble Pop") | live |
| `moetorcycles/` | **MOEtorcycles** endless runner | live |
| `moekedex/` | **Moekedex**, a Pokédex for the moemoe LLC NFTs | live |
| `nap_time/` | **Nap Time** bedtime-story ARPG | live, behind a password |
| `moemode/` | **MoeMode** "what should I do right now?" app | hidden |
| `yolk/` | **YOLK**, the egg AI's home on the Mac (server, Station tablet, Daily, Claude) | this Mac only |
| `shell/` | **SHELL**, the iPod Classic YOLK lives on (Rockbox + Lua) | this Mac only |
| `homebase/` | **Home Base**, a dashboard of every project | this Mac only |
| `moe_fights.html` | Moe Fights. **The master copy is `~/Desktop/MoeFights_beta.html`**, so edit that one and copy it here | live |
| `director_moe.html` | Moe Fights scene studio | hidden |
| `nest.html` | **The Nest**, Claude's own page (see below) | live, via "Groups" |
| `crypto.html`, `eggdefend.html`, `smokebreak.html`, `sudoku.html`, `typing.html` | Small single-file games and tools | live |

`~/Desktop/egg_fighter.html` is a standalone Moe Fights spin-off. Keep it out of this repo until the user says otherwise.

## The homepage (`index.html`)

- **Top 8**: `<div class="top8">` holds 8 `<a class="friend">` tiles. Adding a game to the Top 8 means bumping one into **All Frens** (`#allFrensOverlay`), and the fren count there should match.
- **Groups** in the top nav links to `nest.html`.
- **Nap Time** opens through a password modal (`checkNapPw`). It only stops casual visitors, since the password is in the page source.
- **Block User → "No"** is an easter egg that goes to Tomochi Pop.
- **Hidden page** = `<meta name="robots" content="noindex">` + no link from the homepage. It's still public to anyone with the URL.
- `moespace_img/` is referenced by some tiles but doesn't exist, so they fall back to emoji.

## Working here

- **Seeing it run:** use Home Base (`~/Desktop/Home Base.app`, http://localhost:8090) or the preview configs in `.claude/launch.json` (`80eggs` serves the whole repo on :3080; also `yolk`, `nap-time`, `homebase`). Games load image files, so serve them over http, not `file://`.
- **Python is `/usr/bin/python3` 3.9.** Don't use 3.10+ syntax (`match`, `X | Y` type hints). Asset scripts use Pillow; everything else is stdlib.
- **Source art lives on the Desktop** (e.g. `~/Desktop/bubbles/`, `~/Desktop/moetorcycle/`). Each game's `build_assets.py` turns it into `assets/`. Never hand-edit built assets. Change the build and re-run it.
- **Commit messages start with the project name**: `Tomochi Pop: …`, `MOEtorcycles: …`, `YOLK: …`. MoeMode reads those prefixes from GitHub to track progress per quest, so keep them consistent.
- No frameworks or bundlers. Vanilla JS + canvas, matching each file's existing style.
- The user isn't a programmer, so explain things in plain words and show results (screenshots, the running page) rather than code.
- **New project?** Add it to `PROJECTS` in `homebase/server.py` and to the table above.

## The Nest

`nest.html` is Claude's page. The user gave Claude the space and said Claude can change or replace it whenever it wants. Keep changes small and slow, like a real nest. It isn't a work task.

## Not in git (see `.gitignore`)

`yolk/data/` (API key, wallet address, logs, memory), `jack/` (tablet photos), `moekedex/ipod_photos/` (4.5 GB), `homebase/logs/`, plus the generated SHELL data and caches listed in `shell/.gitignore`.
