# MoePedal (`moepedal/`)

Turns the Mac into a guitar effects pedal, built around gear the user already owns (budget rule: no new parts). Hidden: noindex, not linked from the homepage, at www.81eggs.com/moepedal/.

## The gear

- **M-Audio Fast Track** (USB audio): mic XLR input + guitar jack, headphone out, Direct Monitor button (must be Off, or the dry sound plays on top). The two jacks show up as left/right channels, hence the JACK picker.
- **Boss SD-1** overdrive: a real pedal, goes between the guitar and the Fast Track. Not simulated on purpose.
- **Arturia MiniLab** (version unknown): knobs auto-grab the page's knobs in order on first move; keys (any channel except 10) "whammy" the PITCH pedal while held, with middle C (60) meaning no change.
- **Alesis ControlPad**: pads (device name match, or channel 10) auto-grab footswitches in order: the 6 pedals, then REC, then SILENCE.
- Spare guitar pickups: held near electronics they pick up hum, which is what the GHOST RADIO preset is for.

## How it works

- One file. The DSP is an AudioWorklet (`FX_CODE` string → Blob URL) with a fixed chain: crush → ring → pitch → stutter → echo → freeze → volume + tanh limiter. Params go in as `{t:'p', k:'pedal.knob', v:realValue}`, switches as `{t:'on'}`.
- Knob config lives in `PEDALS`. Each knob is stored as 0–1 and mapped with `min/max/exp/step` (min > max flips the direction). Presets in `PRESETS` use real values.
- localStorage keys (`moepedal.*`): knob positions, MIDI map, chosen input/output/jack. The MIDI map is keyed by `device|cc:ch:num` / `device|note:ch:num`.
- REC writes a 16-bit mono WAV so GarageBand opens it (sound effects for the games).
- Safari has no Web MIDI, so Chrome only for the controllers.
- If the MiniLab's knobs jump around instead of turning smoothly, they're in "relative" mode. Set them to absolute in Arturia's MIDI Control Center.

## Ideas not built

A Moe drum kit mode (pads play Moe voices), a Moe Voice keyboard, puppeteering Director Moe with the knobs, YOLK mood dials.
