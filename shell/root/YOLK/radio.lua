--[[ YOLK RADIO // today's show, YOLK between your songs
     The Mac builds a new show each day (yolk/radio.py). Like MEDITATE, this only leaves
     a note for the music player, since a Lua app can't play sound itself. ]]

require "actions"
dofile("/YOLK/usb.lua")  -- close and hand SHELL over when plugged in

local A, W, H, HZ = rb.actions, rb.LCD_WIDTH, rb.LCD_HEIGHT, rb.HZ
local DIR = "/YOLK/radio/"
local UI = rb.FONT_UI
local BG, YOLK, TEXT = rb.lcd_rgbpack(0, 0, 0), rb.lcd_rgbpack(255, 194, 26), rb.lcd_rgbpack(242, 234, 219)

local function screen(a, b, c)
    rb.lcd_set_foreground(BG); rb.lcd_fillrect(0, 0, W, H)
    local face = rb.read_bmp_file("/YOLK/talk/faces/" .. "great.bmp", false, true)
    if face then rb.lcd_bitmap_transparent(face, W / 2 - 36, 30, 72, 72) end
    rb.lcd_setfont(UI); rb.lcd_set_drawmode(2)
    local function line(col, s, y)
        rb.lcd_set_foreground(col)
        rb.lcd_putsxy((W - rb.font_getstringsize(s, UI)) / 2, y, s)
    end
    line(YOLK, a, 120)
    if b then line(TEXT, b, 146) end
    if c then line(TEXT, c, 166) end
    rb.lcd_update()
end

local f = io.open(DIR .. "today.m3u8", "r")
if not f then
    screen("no show yet.", "plug SHELL into the mac", "and i'll make one.")
    rb.get_plugin_action(HZ / 2)
    rb.get_plugin_action(HZ * 6)
else
    f:close()
    local d = io.open(DIR .. "day.txt", "r")
    local day = d and d:read("*l") or ""
    if d then d:close() end
    screen("YOLK RADIO", "on the air. show of " .. day)
    rb.audio("stop")
    -- same hand-over as meditate.lua: Rockbox resumes this playlist from its first track
    local c = io.open("/.rockbox/.playlist_control", "w")
    if c then
        c:write("P:6:" .. DIR .. ":today.m3u8\n"); c:close()
        require "rbsettings"
        require "settings"
        local st = rb.system.global_status
        rb.settings.write("global_status", st.resume_index, "system", 0)
        rb.settings.write("global_status", st.resume_elapsed, "system", 0)
        rb.settings.write("global_status", st.resume_offset, "system", 0)
        rb.sleep(HZ)
        rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
        os.exit(rb.PLUGIN_GOTO_WPS)
    end
end
rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
