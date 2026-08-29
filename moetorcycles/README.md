# MOEtorcycles 🏍️🖍️

A *Robot Unicorn Attack*–style endless runner — but on motorcycles.
Pick a rider and a bike, then ride your dreams and color everything.

Gameplay, menus, the sprite pipeline, and a real parallax background are done.

## Backgrounds (parallax, per ride)

Each ride has **its own map** — four layers in `assets/bg/` named
`<ride>_sky/far/mid/near.png` (sky opaque & slowest → near transparent &
fastest), scaled to canvas height and tiled horizontally. Built by `bgSet(id)`
and attached to each ride's `bg` in `game.js`; the select screen previews the
map as you switch characters. Crayons = neon city, Eggs = countryside.

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
| Character (select screen) | `←` / `→` | tap left/right of the card |
| Trail style (select screen) | `↑` / `↓` | tap a chip |
| Trail color (select screen) | `C` | tap a swatch |
| Start / menu select | `Space` | tap the ride card or "RIDE!" |
| Back to select (on crash) | `Esc` | — |
| Mute / unmute | `M` | tap the 🔊 button (bottom-right) |

- **Jump** is variable-height — hold longer to jump higher. You get a **double jump**.
- **Dash** gives a short speed burst and lets you smash through crayon-pillar
  obstacles. Without dashing, hitting one is a crash.
- Fall into a gap = crash. Collect ⭐ stars for bonus points.
- Speed ramps up the longer you survive. Best score is saved locally.

## Combo, rings & star currency

- **Giant boost rings** arc over every gap — fly through one for a **soaring
  forward boost** (upward lift + a ~0.85s speed surge, `BOOST_*`), with speed
  lines, a gold glow, and a whoosh. The boost also smashes obstacles.
- **Combo multiplier**: each star or ring builds a chain; the multiplier climbs
  ×1→×8 (`comboMult`) and drives all collectible score. It drains if you stop
  collecting (`COMBO_WINDOW`), shown by the timer bar under the ×N HUD.
- **Stars are currency**: each collected star banks one 🌟 (persisted in
  `localStorage`, survives death). Spend them to unlock content.
- **Near-miss bonus**: clear a hazard by jumping *just* over it (within
  `NEAR_MISS_DIST` px) for a "NEAR MISS" bonus that also feeds the combo. It's
  scored once the hazard slips behind you un-smashed.

## Hazards (per map)

Each map has its own ground hazard — jump over it, or dash / ring-boost to smash
through. They share one collision box (`HAZARDS` size bands in `game.js`); only
the art differs (`o.kind`, drawn by `drawHazard*`): Neon City = crayon pillar,
Countryside = hay bale, China City = red lantern stack, Crystal City = crystal
spike, Tokyo Night = neon construction barricade, MoeMoe Land = red-ringed
heart-eyes emoji.

## Condition-unlocked maps

Most content unlocks by spending stars, but a map can instead unlock on a
**condition** via a `req` function on its `MAPS` entry (with a `reqText` badge).
**MoeMoe Land** — the secret meme level — has `cost: 0` and
`req: () => unlockedCharCount() >= 4`, so it unlocks automatically once you own
4 characters (no stars). `mapUnlocked(m)` is the single gate used everywhere
(select ready-check, map card lock, tap handling).

## Unlocks & mix-and-match maps

Characters, maps, and trail colors/styles each carry a `cost` (0 = free). On the
select screen, **tap a locked item to unlock it** (or `U` for the character);
the 🌟 bank is top-right. Maps are chosen **independently of the character**, so
any unlocked character can ride any unlocked map (the select screen previews the
chosen map as its live background). Each map also sets its **road style**
(`MAPS[].road`, dispatched in `drawRoad`): Neon City = neon asphalt, Countryside
= dirt/gravel. Unlock state persists in
`moetorcycles_unlocks`; the bank in `moetorcycles_bank`.

Select controls: `←/→` character, `[ ]` map (or tap a map card), `↑/↓` trail
style, `C` trail color, `U` unlock, `Space`/tap the bottom prompt to ride.

## Upgrade tree

Permanent boosts bought with banked stars, on their own screen (⬆ UPGRADES on the
select screen, or `T`; `Esc`/BACK to return). Four branches, each a chain you buy
in order (`UPGRADES` array in `game.js`):

- **Jump** — Triple Jump → Quad Jump
- **Dash** — Long Dash → Quick Charge → Double Dash (two charges)
- **Speed** — Cruiser (+base) → Overdrive (+top speed)
- **Stars** — Star Magnet → Double Value
- **Rescue** — Dustoff (survive 1 crash) → Reinforced (survive 2)

The **MOE Zedong Dustoff** shield: with a rescue charge, a crash triggers a
helicopter (`assets/dustoff.png`) that swoops in, hooks the bike, carries it to
solid ground, drops it, and flies off — then a brief invincibility. It's a
`STATE.RESCUE` phase machine (startRescue/updateRescue/endRescue/drawRescue).

Owned upgrades persist in `moetorcycles_upgrades` and are baked into `up` at the
start of each run (`computeUpgrades`). Costs/effects are all in that array and
`computeUpgrades` — easy to tune.

## Sound

All audio is **synthesized at runtime** with the Web Audio API — no audio files,
no network. `audio.js` exposes a `Sound` module: procedural SFX (jump, dash,
star, smash, land, crash, UI) plus a looping synthwave soundtrack (a small
step-sequencer: arp + bass + drums over an Am–F–C–G loop). Browsers block audio
until a user gesture, so `Sound.unlock()` fires on the first key/tap. Mute state
persists in `localStorage` (`moetorcycles_muted`). Tune levels via the gain
values in `audio.js` (`master`, `musicGain`, `sfxGain`) and the `BPM`/`PROG`.

## Trails (Tron-style)

A glowing light trail follows the bike (including through jumps), fading at the
tail. Choose a **color** (6) and a **style** (6) on the select screen — click the
swatches/chips or use the arrow keys; the choice previews live behind the bike
and is saved to localStorage.

- Colors: `TRAIL_COLORS` in `game.js`. Styles: `TRAIL_DESIGNS` (`line`, `ribbon`,
  `rainbow`, `dashed`, `bubbles`, `stars`, `curtain`, `air`); `rainbow` cycles hue
  and ignores color; `curtain` is a bike-height banner; `air` is thin wind streaks.
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

Some AI batches arrive on a **solid white background** (e.g. Bradley's action
poses). `remove_white_bg` in the pipeline keys that out via a **border
flood-fill** (so white *on* the bike is preserved) — pass it as `preprocess=` to
`build_ride`. Frames that are already transparent pass through untouched.

The pipeline has two alignment modes (AI art framing varies between batches):

- `build_ride(...)` — **shared-crop**: when every pose is on one canvas at a
  consistent scale, crop them all to the union bbox. (Crayons.)
- `build_ride_aligned(...)` — **trim + bottom-center**: when poses arrive on
  *different* canvas sizes but the bike is drawn at a consistent pixel scale,
  trim each and drop them onto one common canvas, tyres on a shared baseline.
  (Eggs — its idle frames were a different size than its action poses.)

In `game.js`, `drawPlayer` anchors each sprite by its tyre line and each ride
carries its own `scale` (drawn height) and `wheelFrac` (tyre-contact fraction),
since framing differs between rides — tune those two numbers per ride so the
bike is the right size and the wheels sit on the road.

## Adding a new ride

1. Generate the frames with the character **already on the bike**, one image per
   pose (`ride`, `ride2`, `wheelie`, `air`, `land`, `crash`), all on the same
   canvas so the bike scale/position is consistent between poses.
2. Add a `build_ride(...)` (same canvas) or `build_ride_aligned(...)` (mismatched
   framing) call in `build_assets.py` and re-run it.
3. Add its background layers as `assets/bg/<id>_sky/far/mid/near.png`.
4. Add an entry to the `RIDES` array in `game.js` with the frame files, a
   `preview`, `bg: bgSet("<id>")`, and per-ride `scale` / `wheelFrac` (tune by
   screenshot).

The select screen is a carousel — extra rides show up automatically with
`←/→` (or tap the side arrows) to switch between them.

## Roadmap

- [x] Real background art (4 parallax layers) — **done**
- [x] Tron-style trails (6 colors × 6 styles, picker on select screen) — **done**
- [x] Sound — synthesized SFX + looping soundtrack + mute — **done**
- [x] Combo multiplier + fly-through gold rings — **done**
- [x] Star currency + unlockable characters / maps / trails, mix-and-match maps — **done**
- [x] Near-miss bonus (tight jump over a hazard) — **done**
- [x] Per-map hazards (crayon / hay bale / lantern stack / crystal spike / neon barricade) — **done**
- [ ] More rides (character-on-bike combos), each as single-frame art
- [ ] More maps / background sets
- [ ] Sound + music
- [ ] Power-ups, combos, wheelie/trick scoring
- [ ] Mobile layout polish
