# Defend Your LLC (`moecastle/`)

A remake of Defend Your Castle (old Addicting Games flash game). The Moe Fights roster attacks Moemoe LLC HQ; you grab them and fling them. Fixed 1280×720 canvas, vanilla JS, mouse or touch.

## Files

- `game.js`: tables at the top (`TYPES` invaders, `JOBS`, `SHOP`, `ARENA_ORDER`), then the game.
- `build_assets.py`: pulls fighter frames, arenas out of `~/Desktop/MoeFights_beta.html` into `assets/` (takes ~2 minutes). Never hand-edit `assets/`. Music comes from `~/Downloads/MrCat/` via `afconvert`.

## How it plays

- Damage comes from landing speed (`SAFE_FALL`), so height is what kills. Flung bodies bowl over others.
- Hiring Pit (bought in the shop): anyone but a boss who lands in it joins `roster`, then gets a job on the shop screen.
- A boss comes every 5 days. Score goes to the `llc-defend` board in `api/scores.py`.
- The HQ is drawn in code (`drawCastle`). It could be swapped for real art.

Not linked from the homepage yet. Adding it means bumping a Top 8 tile, or adding it to All Frens.
