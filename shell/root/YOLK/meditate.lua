--[[ MEDITATE // sit with YOLK
     spin    choose            select   ok
     menu    back

     Pick a length and a sound, and YOLK hands over to the music player, which
     plays a ready-made session (bell, sound, bells) from Music/Meditation
     Sessions (made by yolk/tools/make_meditation_sessions.py). A Lua app can't
     play sound itself: it takes the player's memory while it runs. The
     now-playing screen sees the folder and shows YOLK breathing instead.

     Sessions are logged as "meditate" in the check-in log when they start, by
     SHELL's own day count like CHECK IN, so the streak is right even while
     the clock is wrong. ]]

require "actions"
dofile("/YOLK/usb.lua")  -- close and hand SHELL over when plugged in

local A = rb.actions
local W, H, HZ = rb.LCD_WIDTH, rb.LCD_HEIGHT, rb.HZ
local DIR = "/YOLK/"
local SESSIONS = "/Music/Meditation Sessions/"
local UI = rb.FONT_UI
local _, CW, CH = rb.font_getstringsize("M", UI)  -- (width, w, h)

local BG    = rb.lcd_rgbpack(0, 0, 0)
local YOLK  = rb.lcd_rgbpack(255, 194, 26)
local DIM   = rb.lcd_rgbpack(120, 88, 16)
local SHELL = rb.lcd_rgbpack(242, 234, 219)

local LENGTHS = { 5, 10, 15, 20, 30 }
local SOUNDS = {    -- { shown as, file name part, needs headphones }
    { "silence", "silence" },
    { "theta 6Hz binaural", "theta", true },
    { "alpha 10Hz binaural", "alpha", true },
    { "delta 3Hz binaural", "delta", true },
    { "white noise", "white noise" },
    { "pink noise", "pink noise" },
    { "brown noise", "brown noise" },
}
local function track(m, s) return SESSIONS .. string.format("%02d min %s.m4a", LENGTHS[m], SOUNDS[s][2]) end

---------------------------------------------------------------- helpers
local function rect(c, x, y, w, h) rb.lcd_set_foreground(c); rb.lcd_fillrect(x, y, w, h) end
local function text(c, s, x, y)
    rb.lcd_setfont(UI); rb.lcd_set_drawmode(2); rb.lcd_set_foreground(c)
    if x == nil then x = (W - rb.font_getstringsize(s, UI)) / 2 end
    rb.lcd_putsxy(x, y, s)
end
local function exists(path) local f = io.open(path, "r"); if f then f:close() end; return f ~= nil end

local faces = {}
local function face(name)
    if faces[name] == nil then
        faces[name] = rb.read_bmp_file(DIR .. "talk/faces/" .. name .. ".bmp", false, true) or false
    end
    return faces[name] or nil
end
local function draw_face(name, cx, cy)
    local img = face(name)
    if img then rb.lcd_bitmap_transparent(img, cx - 36, cy - 36, 72, 72) end
end

local function pick_list(title, items, sel, note)
    rb.get_plugin_action(HZ / 5)
    while true do
        rect(BG, 0, 0, W, H)
        draw_face("blink", W / 2, 46)
        text(YOLK, title, nil, 88)
        local first = math.max(1, math.min(sel - 2, #items - 4))
        for i = first, math.min(#items, first + 4) do
            local y = 112 + (i - first) * (CH + 4)
            if i == sel then rect(YOLK, 30, y - 2, W - 60, CH + 4) end
            text(i == sel and BG or SHELL, items[i], nil, y)
        end
        if note then text(DIM, note(sel) or "", nil, H - CH - 6) end
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then sel = sel % #items + 1
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then sel = (sel + #items - 2) % #items + 1
        elseif a == A.PLA_SELECT_REL or a == A.PLA_RIGHT then return sel
        elseif a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then return nil end
    end
end

---------------------------------------------------------------- remembering
local function read_last()
    local f = io.open(DIR .. "med/last.txt", "r")
    local m, s = 2, 1
    if f then
        local line = f:read("*l") or ""
        f:close()
        m = tonumber(line:match("^(%d+)")) or m
        s = tonumber(line:match("|(%d+)")) or s
    end
    return math.max(1, math.min(m, #LENGTHS)), math.max(1, math.min(s, #SOUNDS))
end
local function save_last(m, s)
    local f = io.open(DIR .. "med/last.txt", "w")
    if f then f:write(m .. "|" .. s .. "\n"); f:close() end
end

-- add "meditate" to today's check-in (mood 0 = not rated yet); returns the streak
local function log_session(minutes)
    local t = os.time and os.time() or 0
    local today = t / 86400
    local lines, found = {}, false
    local by_day = {}
    local f = io.open(DIR .. "log.txt", "r")
    if f then
        for line in f:lines() do
            local d, tt, m, h = line:match("^(%d+)|(%d+)|(%d)|(.*)$")
            if d then
                d = tonumber(d)
                if d == today then
                    found = true
                    if not ("," .. h .. ","):find(",meditate,", 1, true) then
                        h = (h == "" and "meditate") or (h .. ",meditate")
                    end
                    line = d .. "|" .. tt .. "|" .. m .. "|" .. h
                end
                by_day[d] = h
                lines[#lines + 1] = line
            end
        end
        f:close()
    end
    if not found then
        lines[#lines + 1] = today .. "|" .. t .. "|0|meditate"
        by_day[today] = "meditate"
    end
    f = io.open(DIR .. "log.txt", "w")
    if f then for _, l in ipairs(lines) do f:write(l .. "\n") end; f:close() end
    -- minutes go in their own file, so nothing about check-ins changes shape
    f = io.open(DIR .. "med/sessions.txt", "a")
    if f then f:write(today .. "|" .. t .. "|" .. minutes .. "\n"); f:close() end
    local n, d = 0, today
    while by_day[d] and ("," .. by_day[d] .. ","):find(",meditate,", 1, true) do n = n + 1; d = d - 1 end
    return n
end

---------------------------------------------------------------- run
-- The music player can't be told to play from in here (no memory for a playlist
-- while Lua runs), so leave it a note it reads on its own: a one-track playlist,
-- and the control file Rockbox resumes from when the now-playing screen opens
-- with nothing playing. Resume points at its first track, from the very start;
-- otherwise Rockbox asks "play again?" (last song ran out) or resumes halfway.
local function hand_over(path)
    rb.audio("stop")
    local f = io.open(DIR .. "med/session.m3u8", "w")
    if not f then return false end
    f:write(path .. "\n"); f:close()
    f = io.open("/.rockbox/.playlist_control", "w")
    if not f then return false end
    f:write("P:6:" .. DIR .. "med/:session.m3u8\n"); f:close()
    require "rbsettings"
    require "settings"     -- where each status field lives in this Rockbox build
    local st = rb.system.global_status
    rb.settings.write("global_status", st.resume_index, "system", 0)
    rb.settings.write("global_status", st.resume_elapsed, "system", 0)
    rb.settings.write("global_status", st.resume_offset, "system", 0)
    return true
end

local m_i, s_i = read_last()
local names = {}
for i, mins in ipairs(LENGTHS) do names[i] = mins .. " minutes" end
m_i = pick_list("how long?", names, m_i)
if m_i then
    local snames = {}
    for i, snd in ipairs(SOUNDS) do snames[i] = snd[1] end
    s_i = pick_list("what sound?", snames, s_i, function(i)
        if not exists(track(m_i, i)) then return "not on SHELL yet (plug into the mac)" end
        if SOUNDS[i][3] then return "binaural needs headphones" end
    end)
    if s_i and exists(track(m_i, s_i)) then
        local streak = log_session(LENGTHS[m_i])
        rect(BG, 0, 0, W, H)
        draw_face("blink", W / 2, 80)
        text(YOLK, "eyes closed. i'll ring the bell.", nil, 130)
        if streak > 1 then text(SHELL, streak .. " days in a row.", nil, 154) end
        rb.lcd_update()
        rb.sleep(HZ * 2)
        save_last(m_i, s_i)
        if hand_over(track(m_i, s_i)) then
            rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
            os.exit(rb.PLUGIN_GOTO_WPS)   -- the now-playing screen picks it up from here
        end
    elseif s_i then
        rect(BG, 0, 0, W, H)
        draw_face("ok", W / 2, 80)
        text(SHELL, "that one isn't on SHELL yet.", nil, 130)
        text(DIM, "plug SHELL into the mac and YOLK copies it over.", nil, 154)
        rb.lcd_update()
        rb.get_plugin_action(HZ / 2)
        rb.get_plugin_action(HZ * 6)
    end
end
rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
