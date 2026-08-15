# Nap Time

A story + action game in the **Yumemono** universe. Each night, a character
tells a short bedtime story (visual-novel style), a choice shapes what's
coming, then they *fall asleep* and you play their dream as a top-down ARPG —
where their personal nightmare (a shadow-self) waits as the boss.

> every dream has a shadow

## Run

```bash
cd nap_time
python3 -m http.server 8177
# open http://localhost:8177
```

Or just double-click `index.html` — it runs over `file://` too (all data is
loaded as classic scripts, no fetch).

## Controls

- **Move (dream):** WASD / arrow keys
- **Attack (dream):** Space or click
- **Advance story / choose:** click or Space
- **Heal:** walk over a potion

## Flow

A character's **night** is a *chapter*: an ordered list of story + dream
segments, run by the chapter runner in `engine.js`. Kumori's night:

```
Title
 → story + choice → Dream 1 (collect) → wake
 → story + choice → Dream 2 (survive) → wake
 → story + choice → Dream 3 (defeat the Nightmare boss)
 → victory story → End of Night One
```

Each choice's modifiers thread into the *next* dream (choices shape the dream).
Losing a dream shows a wake-with-a-gasp card and replays that dream. Clearing
the whole chapter marks Kumori cleared (and will unlock other characters).
Progress is saved to `localStorage`.

## Architecture (built to grow)

Classic scripts on a global `NAP` namespace (keeps `file://` working). Scene
manager with pluggable scenes + a transition system.

| File | Role |
|---|---|
| `js/engine.js` | core: canvas/DPR, asset loader, input routing, scene manager, transitions (fade / sleep / wake), save/progress, shared draw helpers |
| `js/data.js` | **content**: characters, bedtime scripts, dream configs, objective defs. Add a character here + its art. |
| `js/backgrounds.js` | procedural VN backgrounds (placeholders until real scene art) |
| `js/vn.js` | visual-novel scene (typewriter dialogue, speaker sprite, choices that set dream modifiers) |
| `js/dream.js` | objective-driven ARPG scene (defeat / survive / collect / escort), Nightmare boss, projectiles, companion |
| `js/title.js`, `js/result.js` | title screen, wake-up/result card + unlock reveal |
| `preprocess.py` | slices/normalises the source art into `assets/processed/` (see below) |

### Choices shape the dream
A story choice merges modifiers into the dream config, e.g.
`{ difficulty, mood, extraPotion, companion }`. Kumori's "gentle" choice brings
a Cloud Buddy companion + an extra potion; "brave" raises the difficulty.

### Objectives
`defeat` (kill the Nightmare) · `survive` (clear 3 waves) · `collect` (XP
fragments) · `escort` (guide the Cloud Buddy). Egg's night uses collect →
survive → defeat.

### Leveling (1–100)
XP fragments and enemy kills grant XP; cost to reach the next level is `5 × level`
(5, 10, 15…). Each level = +8 max HP, +1.5 damage, and a full heal. Level + XP
persist in the save. See `NAP.addXP` / `NAP.xpToNext` in `engine.js`.

### Food buffs
The favorite-food choice persists all night and spawns as a **timed pickup** in
every dream: Apol = speed, Tenddie = damage, Bogir = heal + resist, Pizza =
heal + Cloud Buddy.

### Combat game-feel
`dream.js` adds hit-stop, screen shake, floating damage/XP numbers, knockback,
enemy hit-pop, an attack-arc telegraph, and death-poof rings.

## Assets / build step

Source art: `~/Desktop/diablo yumemono` (Yumemono master sheets). Sprites are
already transparent. `preprocess.py` slices the 4-frame strips (content-aware),
normalises each animation to a constant body height so the character doesn't
grow/shrink between animations, foot-anchors every frame, and exports VN
speaker sprites. Rebuild with `python3 preprocess.py`.

### Multi-character roster
The dream engine is character-agnostic. Sprite sets live in `META.chars`
(playable) and `META.foes` (nightmares); a dream config picks them via
`playerChar` / `enemyFoe`, plus `theme` (tile set), `bg` (background image),
and `bossName`. Adding a character = process their strips in `preprocess.py`
(reuse `player_set` / `foe_set`) and add a config. A **Dream Select** (title →
click) launches available levels. Standalone levels use `NAP.playDream(...)`.

Roster so far: **Egg** (cloud, full 3-dream night) and **Neogaucha** (rooftop,
standalone level vs the **Oni** nightmare, boss with phase 2).

## Status / next

Playable: Egg's full night (collect → survive → defeat, with leveling, food
buffs, juice, boss phase-2 nova) **and** Neogaucha's standalone Rooftop Dream.

**Next up:** Neogaucha's story/night (chapter, room bg, portrait, food choice —
like Egg's), the missing `tile_floor_corrupted.png`, then characters 3–4.
Later: expression portraits, per-character progression, audio.
