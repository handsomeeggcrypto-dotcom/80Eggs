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
| `moecastle/` | **Defend Your LLC**, a Defend Your Castle remake starring the Moe Fights roster. `build_assets.py` makes `assets/` | live |
| `moearmy/` | **MOEMOE ARMY**, a phone-first top-down shooter for the moemoe army PFP push on Scatter: you fire yellow (Bradley) hearts instead of bullets, free caged Moes to grow a V-formation squad, and "love" the enemy: the **Anti Moemoe mouse army** (mice only, never rats), gloom clouds and mouse-driven tanks. Leaderboard `moe-army`, Share on X button. `SCATTER_URL` at the top is the GET A MOE button's link (the moemoe LLC collection on Scatter). Soldiers are a hand-pixelled head (from the soldier art) on a uniform body; the real cut-out head is the squad's face. On the title, **ENLIST YOUR MOE** lets a player upload a picture, frame the head and erase the background (saved in their browser only, `moearmy_custom`); the `<` `>` picker chooses who you play as from `PLAYERS`. Unlockables go there with `unlock: { mice, text }` (mice loved over all games, `moearmy_mice_total`) or `{ stage, text }` (best stage, `moearmy_best_stage`), both kept in the player's browser; **CEO Bradley** (heart head, red suit) unlocks after loving 100 mice; perk `guard`: your squad can't be hit. **Commander Crayons** (hard hat, monster hoodie) unlocks at stage 4; perk `crayon`: rainbow hearts that go through 3 mice. **General Bluu** (big black-haired head, navy uniform) unlocks after freeing 300 Moes in total (`moearmy_freed_total`, unlock `{ freed }`); perk `blue`: your own hearts are big, blue and count double. Players can have a `perk` line shown in the picker. The menus show the official moemoe heart (`assets/heart_face.png`). **Army size**: the first 8 Moes march in a V around you (`SLOTS`), the rest fill ranks in the bottom third of the screen (`armyMax()`, about 60-80 depending on the phone). Once it's full, freeing more promotes a plain Moe (the 1st extra, then every 5th) into Crayons, Bluu or Bradley (`PROMOTE`), who fire their own hearts. Most cages hold 1 Moe; about 15% from stage 2 hold 2-5. **Brute mice**: from stage 4 some mice are brutes (`brute()`, `e.brute`), the muscly bandana mouse drawn 1.5x (`assets/brute_head.png`, `brute_loved.png` from `~/Desktop/moearmy/brute*.webp`): about 3x a mouse's health, slow, fire three frowns at once, health bar, 500 points. **Music**: a Game Boy style march (pulse waves, triangle bass, noise drums, Chinese pentatonic scale) played by a small step sequencer; songs live in `SONGS` (one per level later), written one 16th-note step per token. Plays during a game, stops on pause, game over and the menu. **Trophy case** (TROPHIES button on the title and game over): 18 joke trophies in `TROPHIES` (id, name, how, lore, pixel icon), earned with `award(id)` from game events, saved in `moearmy_trophies`; earning one pops a TROPHY GET! toast. Loved mice switch to the heart-eyed picture (`assets/mouse_loved.png`). You get a gold glow so you stand out from the squad, `assets/head_photo.png`, made by `build_assets.py` from `~/Desktop/moearmy/soldier.jpg`; the mouse head `assets/mouse_head.png` (red bandana, dark grey uniform, so it doesn't look like the Moe army) comes from `~/Desktop/moearmy/mouse.webp`. **Levels** live in `LEVELS` (name + song). Level 2, the **Sunset Strip** (90s rock-club street: neon blade signs from a tiny 3x5 font in `MINI`, palms, parked cars, sunset that turns to night by stage 6, glam rock song `SONGS.strip` with `style: "rock"`), and level 3, the **MOE FACTORY** (the moemoe LLC factory the mice took over: sewing stations, looms, dye vats, conveyor belts of caps and hoodies, alarm beacons from stage 4, song `SONGS.factory` with `style: "machine"`, clank `m` and shift whistle `w` drums), are **this Mac only for now**. Each level's hooks (tile, deco, scroll, under, light, banner) are attached with `Object.assign(LEVELS.x, …)`. **CAMPAIGN** (also on the LEVEL button, never the default) plays them in a row: Boot Camp stages 1-4, the Strip 5-8, the factory 9+ (`CAMPAIGN_EVERY`), with a fade and a song change (`switchLevel`). The LEVEL button on the title only shows on localhost (`LOCAL`), saved in `moearmy_level`. **Meowers** (`spawnMeower`, `drawMeower`): tied-up cats with a HELP bubble, walk into one to save it (+300, `moearmy_meowers_total`). Boot Camp has the wild one in the hat (`assets/meower_wild.png`), the Strip a citizen in a leather jacket and the factory a worker in a hard hat (both `assets/meower_smoke.png`), from `~/Desktop/moearmy/meower_*.jpg`. `?debug` exposes `window.__army` | hidden (noindex); friends reach it through MoeSpace's **Send Message** link until it's ready for everyone |
| `moekedex/` | **Moekedex**, a Pokédex for the moemoe LLC NFTs | live |
| `dreamthings/` | **Dream Things**, a dex for the Yumemono NFTs. `build_data.py` makes `data.js` | live |
| `blorps/` | **The Blorp Museum**, a 90s-web art museum for the 205 Blorp (blue alien) Moes. Reads `moekedex/data.js`, so it needs no data of its own. "My Collection" and the guestbook save in the visitor's browser only. `screensaver.html` is the Blorp screensaver (warp starfield, flies your own Blorps if My Collection has any). `patrol.html` is **Blorp Patrol** (**this Mac only for now**: it's in `.vercelignore` and the museum only shows its button on localhost), a jetpack game: fly into the mothership tube with the right answer (spot the human, find this Blorp, name the trait, pick the rarest). `?debug` exposes `window.__patrol` for testing | live |
| `nap_time/` | **Nap Time** bedtime-story ARPG | live, behind a password |
| `moemode/` | **MoeMode** "what should I do right now?" app | hidden |
| `moepedal/` | **MoePedal**, the Mac as a weird guitar effects pedal: M-Audio Fast Track in, Arturia MiniLab knobs/keys, Alesis ControlPad footswitches (Web Audio + Web MIDI, Chrome only) | hidden |
| `yolk/` | **YOLK**, the egg AI's home on the Mac (server, Station tablet, Daily, Claude) | this Mac only |
| `shell/` | **SHELL**, the iPod Classic YOLK lives on (Rockbox + Lua) | this Mac only |
| `nestegg/` | **Nest Egg**, practice crypto bots with fake money: Solana memecoins (with rug checks) and SOL. Runs all the time as a LaunchAgent. No wallet, can't trade | this Mac only |
| `homebase/` | **Home Base**, a dashboard of every project | this Mac only |
| `moe_fights.html` | Moe Fights. **The master copy is `~/Desktop/MoeFights_beta.html`**, so edit that one and copy it here | live |
| `director_moe.html` | Moe Fights scene studio | hidden |
| `nest.html` | **The Nest**, Claude's own page (see below) | live, via "Groups" |
| `scores.js` + `api/scores.py` | **Shared leaderboards** for Tomochi Pop (Classic, Rush), MOEtorcycles (Normal, Portal), Defend Your LLC and MOEMOE ARMY. `api/` is a Vercel Python function backed by Upstash Redis | live |
| `retro.js` | **The 90s kit**: one `<script src="/retro.js" data-kit="stars sparkles ring counter">` line gives a page the starfield, mouse sparkles, visitor counter and the **80Eggs Webring** bar. The ring's order is `RING` at the top of the file, so add new pages there. On the Blorp Museum, Moekedex, Dream Things, Sudoku and the Nest so far (full-screen games are in the ring but don't show the bar) | live |
| `api/telegram.py` | **Telegram bot**: `/pop` posts the Tomochi Pop menu picture + a Play button; `/scores` posts the top 5 of the Tomochi Pop leaderboards (the bot is for the Tomochi group, so no MOEtorcycles). Token is `TELEGRAM_BOT_TOKEN` in Vercel; webhook points at `/api/telegram`. Add commands to `COMMANDS` | live |
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
- **Leaderboards:** the only server code on the site is `api/scores.py` (Python stdlib, must stay 3.9-compatible to test here). It needs the Upstash database connected in the Vercel dashboard, which gives it `KV_REST_API_URL`/`KV_REST_API_TOKEN`. A plain `http.server` has no `/api`, so the board just says it can't connect. To add a board, add it to `BOARDS` in `api/scores.py`, and to `TITLES`/`LOCAL_BEST` in `scores.js`. To remove a rude name, ask Claude to `ZREM` it from `lb:<board>`.
- The user isn't a programmer, so explain things in plain words and show results (screenshots, the running page) rather than code.
- **New project?** Add it to `PROJECTS` in `homebase/server.py` and to the table above.

## The Nest

`nest.html` is Claude's page. The user gave Claude the space and said Claude can change or replace it whenever it wants. Keep changes small and slow, like a real nest. It isn't a work task.

## Not on the website (see `.vercelignore`)

`yolk/`, `shell/`, `homebase/`, `nestegg/` and every `CLAUDE.md`. They're in the public GitHub repo but Vercel skips them. A new Mac-only project goes in `.vercelignore` too. Keep personal details (real name, town, addresses, wallet) out of code and comments, and put them in gitignored data files instead.

## Not in git (see `.gitignore`)

`yolk/data/` (API key, wallet address, logs, memory), `jack/` (tablet photos), `moekedex/ipod_photos/` (4.5 GB), `homebase/logs/`, `nestegg/data/`, plus the generated SHELL data and caches listed in `shell/.gitignore`.
