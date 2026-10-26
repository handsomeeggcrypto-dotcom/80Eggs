# Nap Time (`nap_time/`)

Bedtime story (visual novel) → play the character's dream as a top-down ARPG with a nightmare boss. Set in the **Yumemono** universe. **`README.md` is the full guide (flow, architecture table, objectives, leveling, assets). Read it first.**

- Run: `python3 nap_time/serve.py` (port 8177, no-cache headers) or the `nap-time` preview config. It also runs over `file://`.
- On the live site it sits behind the homepage's password modal (`checkNapPw` in `index.html`).
- Code: classic scripts on a global `NAP` namespace (no modules, so `file://` keeps working). Content lives in `js/data.js`, and adding a character starts there.
- Art: `~/Desktop/diablo yumemono` master sheets → `python3 preprocess.py` → `assets/processed/`. Don't hand-edit processed frames.
- Playable now: Egg's full night and Neogaucha's standalone Rooftop Dream.
- Next (from the README): Neogaucha's story night, the missing `tile_floor_corrupted.png`, characters 3–4, then portraits and audio.

Commit prefix: `Nap Time:`.
