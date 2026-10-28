# Tomochi Pop (`bubbles/`)

Bubble shooter with the user's character art as bubbles. It started as a proof of concept to get the team making custom art, so how the art looks matters more than clever mechanics. It was called "Bubble Pop" until 2026-10-10, which is why the folder is still `bubbles/` and the old commits say "Bubble Pop:". New commits use **`Tomochi Pop:`**.

Run: `python3 -m http.server` from the repo root, or Home Base → Play. Canvas game, portrait.

## Files

- `game.js`: everything except level data. Key tables near the top: `GAME_TITLE`, `TYPES` (the 6 bubble characters + tints), `MODES`, `SLIDE_CHANCE`, `SPECIALS_PER_GAME`, `SPECIAL_UNLOCK_LEVEL` (torpedo 15, ghosts 30), `STICKER_WEIGHT`, `TIPS`.
- `levels.js`: 60 hand-made levels + `WORLDS` (4 worlds × 15 levels: Nature Trail, Donut Shop, Strawberry Farm, Japanese Garden, each with a background and 2 map images). Loaded before game.js.
- `build_assets.py`: builds `assets/` from `~/Desktop/bubbles/`. Re-run it after the user drops in new art.

## Art pipeline (`~/Desktop/bubbles/` → `assets/`)

The build sorts files by name prefix:

- **Bubble characters** (cat_donut, luna_donut, poki, …) → 256² trimmed squares. The files say `.jpeg` but are really transparent PNGs. White is keyed out only when there's no alpha.
- `*_slide_*` → `assets/slides/` + `slides.json`. Characters that peek in from the screen edge. The build detects which edge is the "cut" side and rotates so it sits flush. It also accepts the misspelling `randon_slide_*`.
- `win_*` / `lose_*` → `assets/stickers/` (end-screen stickers). `hamster_projectile*` / `summon*` / `ghost*` → `assets/fx/`.
- `menu_*` → `assets/menu/` (JPEG), `level_bg_*` → `assets/bg/`, `map_bg_*` → `assets/map/`, `*.mp3` → `assets/music/` (renamed to snake_case).

Prompt guidance that worked for AI backgrounds: 2:3 portrait, calm middle, **no round shapes** (they read as bubbles), no text. For map art: overhead board-game view, **no roads** (the game draws its own path), props at the edges.

## Rules the user set

- The rating is **hamstars** (hamster in a star), never "stars". Score-goal levels use ⚡.
- Slides: one shuffled pool, each shows once before repeats, never after every action. The user likes the current frequency. Slow entrances should be the most common.
- Tips appear **once each**, only when something new shows up. Not every early level should be a tutorial.
- Music plays everywhere: loud on menus (0.45), quiet in game (0.1). It can't start until the first tap (autoplay rules) and goes through a Web Audio gain node because iOS ignores `<audio>.volume`.
- Everyone plays the "Raw art" style. The S key still cycles styles for testing only.

## Level design gotchas

- Layout chars: `.` empty, `*` random, `1-6` palette slot, `#` stone (only falls), `@` trapped friend (rescue goal).
- Never put stones directly under colour bubbles near the ceiling or side walls, or the bubbles behind become unreachable and a "clear" level can't be won. In bot tests this shows up as 2–4 bubbles always left.
- A ceiling `drop` on a clear level makes it much harder.
- Adding a 5th world = append a `WORLDS` entry + 15 levels + its background and map art.

## Leaderboards

Classic and Rush scores go to the shared leaderboard (`../scores.js`, boards `tomochi-classic` / `tomochi-rush`) from `saveBest()`. Levels don't. The title screen (top-right) and end screen have a 🏆 LEADERBOARD button, and the end screen shows the player's world rank.

## Saved data (localStorage)

Keys stay `bubblepop_*` on purpose so players keep their progress: `bubblepop_levels`, `bubblepop_best_<mode>`, `bubblepop_tips`, `bubblepop_volume`, `bubblepop_muted`.

Testing on a phone matters. The user playtests on one.
