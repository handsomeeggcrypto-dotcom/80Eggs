# MOEtorcycles 🏍️🖍️

A *Robot Unicorn Attack*–style endless runner — but on motorcycles.
Pick a rider and a bike, then ride your dreams and color everything.

Gameplay, menus, the sprite pipeline, and a real parallax background are done.

## Background (parallax)

Four image layers in `assets/bg/` scroll at different speeds for depth:
`bg_sky.png` (opaque, slowest) → `bg_far.png` → `bg_mid.png` → `bg_near.png`
(transparent, fastest). They're defined in the `BG_LAYERS` array in `game.js`;
each is scaled to canvas height and tiled horizontally.

- `SKY_TINT` (top of `game.js`, 0–1) adds a dusk overlay to darken a bright sky
  toward night if you ever want the neon layers to pop more. Currently `0`.
- Tiling is a plain horizontal repeat. If a seam ever shows on a layer, we can
  switch that layer to mirror-tiling or seam-blend it in a pipeline step.

## Run it

Because the game loads image files, run it from a local web server (rather than
double-clicking, which some browsers block):

```bash
cd moetorcycles && python3 -m http.server 8777
```

Then open http://localhost:8777/ in your browser.

## Controls

| Action | Keyboard | Touch / Mouse |
| --- | --- | --- |
| Jump / double-jump | `Space` / `↑` / `W` | tap left ~60% of screen |
| Dash (speed burst, smashes obstacles) | `Shift` / `X` | tap right ~40% of screen |
| Trail color (select screen) | `←` / `→` | tap a swatch |
| Trail style (select screen) | `↑` / `↓` | tap a chip |
| Start / menu select | `Space` | tap the ride card or "RIDE!" |
| Back to select (on crash) | `Esc` | — |

- **Jump** is variable-height — hold longer to jump higher. You get a **double jump**.
- **Dash** gives a short speed burst and lets you smash through crayon-pillar
  obstacles. Without dashing, hitting one is a crash.
- Fall into a gap = crash. Collect ⭐ stars for bonus points.
- Speed ramps up the longer you survive. Best score is saved locally.

## Trails (Tron-style)

A glowing light trail follows the bike (including through jumps), fading at the
tail. Choose a **color** (6) and a **style** (6) on the select screen — click the
swatches/chips or use the arrow keys; the choice previews live behind the bike
and is saved to localStorage.

- Colors: `TRAIL_COLORS` in `game.js`. Styles: `TRAIL_DESIGNS` (`line`, `ribbon`,
  `rainbow`, `dashed`, `bubbles`, `stars`); `rainbow` cycles hue and ignores color.
- Add a color/style by appending to those arrays. New path styles slot into
  `drawTrail()`; the picker and preview pick them up automatically.

## Rides (character + bike combos)

A **ride** is one character already on a bike, drawn as **single frames** (one
PNG per pose): `ride`/`ride2` (idle cruise, alternated), `wheelie` (rising),
`air` (falling), `land`, `crash`. No runtime rider/bike alignment — what you draw
is what rides. Rides are defined in the `RIDES` array near the top of `game.js`.

Source art lives on the desktop in `~/Desktop/moetorcycle/`. Regenerate
`assets/` any time the source art changes:

```bash
cd moetorcycles && python3 build_assets.py
```

The pipeline crops every pose of a ride to **one shared bounding box** (not each
trimmed individually) so the bike stays aligned across poses and doesn't hop when
the pose changes. In `game.js`, `drawPlayer` anchors the sprite by its tyre line
(`WHEEL_FRAC`) so the wheels rest on the road.

## Adding a new ride

1. Generate the frames with the character **already on the bike**, one image per
   pose (`ride`, `ride2`, `wheelie`, `air`, `land`, `crash`), all on the same
   canvas so the bike scale/position is consistent between poses.
2. Add a `build_ride("<id>", { pose: "file.png", ... })` call in `build_assets.py`
   and re-run it.
3. Add an entry to the `RIDES` array in `game.js` pointing at the new frame files
   plus a `preview` image for the select screen.

The select screen is a carousel — extra rides show up automatically with
`←/→` (or tap the side arrows) to switch between them.

## Roadmap

- [x] Real background art (4 parallax layers) — **done**
- [x] Tron-style trails (6 colors × 6 styles, picker on select screen) — **done**
- [ ] More rides (character-on-bike combos), each as single-frame art
- [ ] Sound + music
- [ ] Power-ups, combos, wheelie/trick scoring
- [ ] Mobile layout polish
