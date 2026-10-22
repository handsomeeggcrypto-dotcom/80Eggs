#!/usr/bin/env python3
"""Adds a scripted-input hook to Rockbox's SDL simulator (button-sdl.c).

With SIMCMD=<file>, the simulator reads one command per line from that file:
  select longselect menu play left right down up dump "wait N"
(down/up turn the click wheel; dump saves a screenshot to the sim's disk).
"""
import sys

path = sys.argv[1]
s = open(path).read()
if "simcmd_poll" in s:
    sys.exit(0)

HOOK = r'''
/* SHELL harness: read scripted button presses from $SIMCMD (one per line) */
static int simcmd_poll(void)
{
    static long off = 0; static int hold = 0, held = 0, wait = 0, tick = 0;
    static char buf[64]; static int blen = 0;
    const char *path = getenv("SIMCMD");
    if (!path) return 0;
    if (hold > 0) { hold--; return held; }
    if (wait > 0) { wait--; return 0; }
    if (++tick % 5) return 0;
    SDL_RWops *f = SDL_RWFromFile(path, "rb");
    if (!f) return 0;
    SDL_RWseek(f, off, RW_SEEK_SET);
    char c;
    while (SDL_RWread(f, &c, 1, 1) == 1) {
        off++;
        if (c != '\n') { if (blen < 63) buf[blen++] = c; continue; }
        buf[blen] = 0; blen = 0;
        SDL_RWclose(f);
        held = 0;
        if (!strcmp(buf, "dump")) { sim_trigger_screendump(); return 0; }
        if (!strncmp(buf, "wait ", 5)) { wait = atoi(buf + 5); return 0; }
        if (!strcmp(buf, "menu")) held = BUTTON_MENU;
        else if (!strcmp(buf, "select")) held = BUTTON_SELECT;
        else if (!strcmp(buf, "longselect")) { held = BUTTON_SELECT; hold = 120; return held; }
        else if (!strcmp(buf, "left")) held = BUTTON_LEFT;
        else if (!strcmp(buf, "right")) held = BUTTON_RIGHT;
        else if (!strcmp(buf, "play")) held = BUTTON_PLAY;
        else if (!strcmp(buf, "down")) { scrollwheel_event(0, -1); return 0; }
        else if (!strcmp(buf, "up")) { scrollwheel_event(0, 1); return 0; }
        hold = 6;
        return held;
    }
    SDL_RWclose(f);
    return 0;
}
'''

anchor = "#if defined(HAVE_BUTTON_DATA)\nint button_read_device(int* data)"
assert anchor in s, "button_read_device not found"
s = s.replace(anchor, HOOK + "\n" + anchor, 1)
s = s.replace("    return btn;\n}\n\nvoid button_init_device", "    return btn | simcmd_poll();\n}\n\nvoid button_init_device", 1)
open(path, "w").write(s)
print("patched", path)
