# Moekedex (`moekedex/`)

Pokédex-style lookup for all 5,250 **moemoe LLC** NFTs. Type a number, browse with the d-pad, hit random, or click a trait to jump to another Moe that has it. It reads entries aloud with speechSynthesis. `#1234` in the URL opens that Moe.

## Files

- `index.html`: the whole app. The device is the user's own art, split into `dex_left.webp` / `dex_right.webp` (cut at art x=806) so the halves stack on phones. Every button and screen is an overlay placed in **original-art pixel coordinates** with `--x/--y/--w/--h` CSS variables. Add `?debug` to the URL to outline them.
- `data.js`: `window.MOEDEX`, all traits, value counts, rarity ranks and image version params for every token (~316KB, one line). Generated, so don't hand-edit it.
- `icon.png`: the yellow pixel heart (the homepage Top 8 tile).
- `ipod_photos/`: 4.5 GB of 480px JPEGs for the iPod's Photos app. **Gitignored, never commit it.**

## Data source

- Contract `0x06f97E756f5c7aC0db75411101Bd09e17F63ABa7` (Ethereum mainnet), ids 1–5250.
- tokenURI → `https://www.scatter.art/api/instareveal/wptfgy1wqkagfmd05vz3zult/<id>`. **That API sends no CORS headers**, which is why metadata is baked into `data.js` instead of fetched live. Images load fine as `<img>` (they redirect to signed URLs and need each token's `v=` param, which is stored in data.js).
- Keyless RPC that worked: `eth.drpc.org` (publicnode and llamarpc didn't).
- The fetch/rebuild script wasn't kept in the repo. If the collection's metadata changes, write it again (fetch every tokenURI → rebuild `data.js` in the same shape).
- Rarity rank = sum of (N / count) for each trait, counting "missing trait" as a value too. Rank 1 is the rarest (#1674).

The iPod version (Moekadex on SHELL) is built separately by `shell/tools/gen_moekadex.py`. The YOLK server uses `ipod_photos/` for Moe lookups.
