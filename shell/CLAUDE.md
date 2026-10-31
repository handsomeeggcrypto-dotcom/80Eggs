# SHELL (`shell/`)

**SHELL** is the user's iPod Classic 6G (A1238) running Rockbox. **YOLK** is the AI who lives on it. When plugged in it mounts at `/Volumes/SHELL`. No Wi-Fi, mic or speaker, so everything live is Lua on the device. New content arrives when it's plugged into the Mac (see `yolk/`).

## Layout

- `root/` **mirrors the iPod drive**: `.rockbox/` (theme `yolk.cfg`, `wps/yolk.wps|sbs` skins, `shortcuts.txt`) and `YOLK/` (the Lua apps).
- Apps in `root/YOLK/`: `boot.lua` (power-on animation), `talk.lua` (Talk to YOLK + check-ins; `checkin.lua` runs it in check-in-only mode), `moekadex.lua` (Moe lookup; `dreams.lua` reuses it for **Dream Things**, the Yumemono dex), `moto.lua` (MOEtorcycles Mini), `meditate.lua`, `usb.lua`.
- `tools/`: generators (`gen_art.py`, `gen_moekadex.py`, `gen_dreams.py`, `gen_dex_index.py`, `gen_moto.py`), `backup_shell.py` / `restore_shell.py`, and `sim/` (Rockbox simulator).
- `backup/`: snapshots of the real drive (gitignored).
- Generated Moekadex/Dream Things data and images are gitignored (431MB+). Rebuild with the `gen_*.py` scripts.

## Testing without the iPod

`tools/sim/setup.sh` builds the ipod6g Rockbox simulator + `checkwps` into `tools/sim/build/` (needs brew `sdl2` + `gcc`). `tools/sim/run.sh "select;down;wait 5;dump" N out.png` runs scripted button presses and saves a contact sheet. The wheel's up/down is imprecise in menus. The reliable path is Shortcuts, then one "down".

## Rockbox Lua gotchas (learned the hard way)

- Lua 5.1, **integers only**: no `0.5`, `math.sqrt` or `//`.
- `os.date` returns nil, so compute dates from `os.time()`. `rb.font_load` fails (no memory), so use `rb.FONT_UI` + pre-rendered title BMPs. `rb.font_getstringsize` returns (width, w, h).
- Rockbox system events (negative numbers from `get_plugin_action`, a burst at power-on) aren't button presses. Whitelist `PLA_*` buttons in any "press to skip" check.
- **Lua can't play audio**: the plugin takes the whole audio buffer. To play something, write a one-track `.m3u8` + `/.rockbox/.playlist_control`, reset `global_status` resume fields, then `os.exit(rb.PLUGIN_GOTO_WPS)` (see `meditate.lua`).
- Full-screen transparent blits are slow on the device. Bake backgrounds into solid images.
- Skins: a literal `%` must be `%%`, `%t` is tenths of a second, and see-through images in timed sublines smear.
- The boot animation runs from `start in screen: plugin` + a hand-made `/.rockbox/rocks/plugin.dat`. **Don't put `openplugin:` lines in config.cfg**, because that crashes Rockbox at boot.

## Hardware state

Swapped 2026-10-31: iFlash-Solo + ribbon + 3000mAh battery + 128GB SD. The clock is set. The old hard drive is the fallback, so keep it intact.

To set up a new card (details in `tools/restore_shell.py`):

1. Run `backup_shell.py` first.
2. Put the card in the iPod. **Don't format it in a card reader or erase the whole disk.** Bootloader 1.0 then says "No partition found". In Apple's disk mode, use `diskutil eraseVolume "MS-DOS FAT32" SHELL diskNs1`, keeping the partition at block 63.
3. Run `restore_shell.py /Volumes/SHELL` in disk mode.

Don't write to her in bootloader USB mode. **Never "Restore" the iPod in Finder**, because it reformats it HFS+.

Commit prefix: `SHELL:`.
