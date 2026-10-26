# MOEtorcycles (`moetorcycles/`)

Robot Unicorn Attack–style endless runner on motorcycles. **`README.md` covers modes, controls and backgrounds. Read it first.** This file is the rules and gotchas.

Run: `python3 -m http.server` from the repo root (or Home Base → Play). Fixed 1280×720 canvas, scaled to fit. Works with touch on phones.

## Files

- `game.js` (~3.6k lines): data tables at the top, `RIDES` (characters), `MAPS`, `HAZARDS`, `TRAIL_COLORS`, `TRAIL_DESIGNS`, `MODES`, `UPGRADES`, then the game.
- `audio.js`: sound effects and music.
- `build_assets.py`: `~/Desktop/moetorcycle/` source art → `assets/` (rider frames, parallax backgrounds).

## Core design decisions

- **A "ride" is one character already drawn on their vehicle**, one PNG per pose: ride / air / land / wheelie / crash. No mix-and-match of riders and bikes. New characters must be drawn already on the bike.
- **Feel = long, floaty, majestic jumps**, relaxing rather than fast. Keep it when tuning physics (`GRAVITY`, `JUMP_V`, `SPEED_*`).
- Hazards stay **on the ground** (jump over, or dash to smash). The user rejected overhead hazards, drones and birds.
- Stars are the currency (`moetorcycles_bank`). Unlocks are keyed `char:` / `map:` / `tc:<index>` / `ts:`. **Append new trail colors at the END** of `TRAIL_COLORS`, because unlocks are stored by index.
- Cruise mode earns nothing on purpose. That was the user's call.

## Adding a character or map

- Character: add frames to the Desktop art folder, add a `build_ride(...)` call in `build_assets.py`, and add a `RIDES` entry with `cost`, `scale` (~1.5 for bikes; Poki's toy car is 0.95), `wheelFrac` (where the wheels touch the road) and an optional `trailX`.
- Map: 4 parallax layers `<map>_sky/far/mid/near` via `bgSet(id)`, a custom `drawRoad<Name>` and a hazard type in `HAZARDS` with its own `drawHazard<Name>`.
- AI art often comes with a **fake transparency checkerboard baked in**. The build has `remove_checker_bg` (light checker) and `remove_grey_checker` (darker). `auto_key` skips frames that already have alpha.
- Sprites are capped at 480px tall and backgrounds at 720px tall (the asset folder went 144MB → 41MB). Characters and maps load lazily when picked.

## Gotchas

- In the automated browser pane, animation frames are throttled between tool calls. Verify by taking screenshots (they force a frame) or calling `update()`/`render()` manually.
- In normal mode, a step up of more than 40px without a jump makes you fall through. Keep generated hills within that.
- iPhone Safari has no Fullscreen API. True fullscreen only works via Add to Home Screen.

There's a mini version on the iPod: `shell/root/YOLK/moto.lua`, art from `shell/tools/gen_moto.py`.
