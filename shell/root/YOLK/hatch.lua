--[[ HATCHERY // an egg that hatches Moes while you listen to music
     select   hold the egg (or hatch it when it's ready)
     right    my moes (wheel to browse)
     menu     leave

     The egg warms up from music you actually play: it reads Rockbox's
     playback log (/.rockbox/playback.log, which this app switches on) and
     counts the listened seconds since last time. The first egg needs 30
     minutes, every egg after it 2 hours. When it hatches, a random Moe from
     the Moekadex comes out and joins your collection.

     /YOLK/hatch/state.txt   pos (bytes of the log already counted), warm (seconds), hatched, started
     /YOLK/hatch/moes.txt    one Moe number per line, oldest first
     Egg art: tools/gen_hatch.py ]]

require "actions"
dofile("/YOLK/usb.lua")  -- close and hand SHELL over when plugged in

local A = rb.actions
local W, H, HZ = rb.LCD_WIDTH, rb.LCD_HEIGHT, rb.HZ
local DIR = "/YOLK/hatch/"
local DEX = "/YOLK/moekadex/"
local LOG = "/.rockbox/playback.log"
local MOES = 5250
local FIRST, NEXT = 30 * 60, 2 * 3600       -- seconds of music per egg
local UI = rb.FONT_UI

local BG     = rb.lcd_rgbpack(10, 8, 6)
local YOLK   = rb.lcd_rgbpack(255, 194, 26)
local DIM    = rb.lcd_rgbpack(120, 88, 16)
local CREAM  = rb.lcd_rgbpack(242, 234, 219)
local GLOW   = rb.lcd_rgbpack(255, 230, 120)
local TIER = {
    MYTHIC    = rb.lcd_rgbpack(255, 61, 110),
    LEGENDARY = YOLK,
    EPIC      = rb.lcd_rgbpack(190, 110, 255),
    RARE      = rb.lcd_rgbpack(61, 245, 255),
    COMMON    = rb.lcd_rgbpack(150, 160, 190),
}
local _, CW, CH = rb.font_getstringsize("M", UI)

---------------------------------------------------------------- drawing
local function rect(color, x, y, w, h)
    rb.lcd_set_foreground(color)
    rb.lcd_fillrect(x, y, w, h)
end

local function text(color, str, x, y)
    rb.lcd_setfont(UI)
    rb.lcd_set_drawmode(2)
    rb.lcd_set_foreground(color)
    if x == "center" then x = (W - #str * CW) / 2 end
    rb.lcd_putsxy(x, y, str)
end

local images = {}
local function img(path)
    if images[path] == nil then images[path] = rb.read_bmp_file(path, false, true) or false end
    return images[path] or nil
end

local function blit(i, x, y)
    if i then rb.lcd_bitmap_transparent(i, x, y, i:width(), i:height()) end
end

local function pick(list) return list[math.random(1, #list)] end

---------------------------------------------------------------- state
local st = { pos = 0, warm = 0, hatched = 0, started = 0 }
local mine = {}

local function load()
    local f = io.open(DIR .. "state.txt", "r")
    if f then
        for line in f:lines() do
            local k, v = line:match("^(%w+)=(%d+)$")
            if k then st[k] = tonumber(v) end
        end
        f:close()
    end
    f = io.open(DIR .. "moes.txt", "r")
    if f then
        for line in f:lines() do
            local n = tonumber(line:match("^(%d+)"))
            if n then mine[#mine + 1] = n end
        end
        f:close()
    end
end

local function save()
    local f = io.open(DIR .. "state.txt", "w")
    if not f then return end
    f:write("pos=" .. st.pos .. "\nwarm=" .. st.warm .. "\nhatched=" .. st.hatched .. "\nstarted=" .. st.started .. "\n")
    f:close()
end
YOLK_ON_USB = save

local function need() return st.hatched == 0 and FIRST or NEXT end

-- switches Rockbox's playback log on (returns true if it was off). Once the log
-- exists it's on, so the big settings tables are only loaded the first time.
local function log_on()
    local f = io.open(LOG, "r")
    if f then f:close(); return false end
    local was_off = false
    pcall(function()
        require "rbsettings"
        require "settings"
        local gs = rb.system.global_settings
        if not rb.settings.read("global_settings", gs.playback_log) then
            rb.settings.write("global_settings", gs.playback_log, "system", 1)
            if rb.settings_save then rb.settings_save() end
            was_off = true
        end
    end)
    return was_off
end

-- adds up music played since last time: log lines are "time:elapsed ms:length ms:path"
local function listen()
    local f = io.open(LOG, "r")
    if not f then return 0 end
    local size = f:seek("end")
    if size < st.pos then st.pos = 0 end      -- the log filled up and Rockbox started a new one
    f:seek("set", st.pos)
    local secs = 0
    for line in f:lines() do
        local el, len = line:match("^%d+:(%d+):(%d+):")
        if el then
            el, len = tonumber(el), tonumber(len)
            if len > 0 and el > len then el = len end
            secs = secs + el / 1000
        end
    end
    st.pos = size
    f:close()
    st.warm = st.warm + secs
    return secs
end

---------------------------------------------------------------- moes
local reclen
do
    local f = io.open(DEX .. "reclen.txt", "r")
    reclen = f and tonumber(f:read("*l")) or 0
    if f then f:close() end
end

local function moe(n)
    local m = { n = n, rank = "?", tier = "COMMON" }
    local f = reclen > 0 and io.open(DEX .. "data.txt", "rb")
    if not f then return m end
    f:seek("set", (n - 1) * reclen)
    local line = f:read(reclen - 1) or ""
    f:close()
    local rank, tier = line:match("^([^|]*)|([^|]*)")
    if rank then m.rank, m.tier = rank, tier end
    return m
end

local function picture(n)
    return rb.read_bmp_file(DEX .. "img/" .. tostring((n - 1) / 500) .. "/" .. n .. ".bmp", false, true)
        or img(DEX .. "bradley.bmp")
end

-- a step-by-step trail in /YOLK/hatch/trace.txt, so a freeze on the iPod can be traced
local function trace(step)
    local f = io.open(DIR .. "trace.txt", "w")
    if f then f:write(step .. "\n"); f:close() end
end

-- 1..MOES, even if the iPod's random numbers come out negative
local function random_moe()
    local n = math.random(MOES) % MOES
    if n < 0 then n = n + MOES end
    return n + 1
end

local function have(n)
    for _, m in ipairs(mine) do if m == n then return true end end
    return false
end

-- one Moe on screen, with a caption under it
local function show_moe(n, top, caption)
    local m = moe(n)
    rect(BG, 0, 0, W, H)
    if top then text(YOLK, top, "center", 4) end
    local p = picture(n)
    if p then blit(p, (W - p:width()) / 2, 4 + CH + 2) end
    local y = H - CH * 2 - 6
    text(CREAM, "MOE #" .. n .. "  ", (W - (#("MOE #" .. n .. "  ") + #m.tier) * CW) / 2, y)
    text(TIER[m.tier] or CREAM, m.tier, (W - (#("MOE #" .. n .. "  ") + #m.tier) * CW) / 2 + #("MOE #" .. n .. "  ") * CW, y)
    text(DIM, caption or ("rank " .. m.rank .. " of " .. MOES), "center", y + CH + 2)
    rb.lcd_update()
    return m
end

---------------------------------------------------------------- screens
local said = nil

local function draw(dx, full)                  -- full: draw the egg ready to hatch
    local warm, goal = st.warm, need()
    if full then warm = goal end
    local stage = warm >= goal and 4 or warm * 4 / goal
    rect(BG, 0, 0, W, H)
    text(YOLK, "HATCHERY", "center", 4)
    if said then text(CREAM, said, "center", 4 + CH + 4) end
    blit(img(DIR .. "egg" .. stage .. ".bmp"), (W - 96) / 2 + (dx or 0), 26 + CH)
    local y = 30 + CH + 120 + 6
    local mins, goal_m = warm / 60, goal / 60
    if mins > goal_m then mins = goal_m end
    rect(DIM, 40, y, W - 80, 8)
    rect(warm >= goal and GLOW or YOLK, 41, y + 1, (W - 82) * mins / goal_m, 6)
    local label = warm >= goal and "READY. PRESS SELECT." or (mins .. " / " .. goal_m .. " min of music")
    text(warm >= goal and GLOW or CREAM, label, "center", y + 12)
    text(DIM, #mine .. (#mine == 1 and " moe" or " moes") .. " hatched   > my moes", "center", y + 14 + CH)
    rb.lcd_update()
end

local function wobble()
    for i = 1, 8 do
        draw(i % 2 == 0 and 3 or -3)
        rb.get_plugin_action(HZ / 12)
    end
    draw()
end

local function hatch()
    said = nil
    trace("1 pick")
    local n = random_moe()
    for _ = 1, 6 do                                   -- new ones first, if it can
        if not have(n) then break end
        n = random_moe()
    end
    local twin = have(n)
    trace("2 save #" .. n)                            -- kept before any animation, so nothing can lose it
    st.warm = st.warm - need()
    st.hatched = st.hatched + 1
    mine[#mine + 1] = n
    local f = io.open(DIR .. "moes.txt", "a")
    if f then f:write(n .. "\n"); f:close() end
    save()
    trace("3 shake #" .. n)
    for i = 1, 16 do                                  -- it shakes harder and harder
        local d = (i / 4 + 1) * (i % 2 == 0 and 1 or -1)
        draw(d, true)
        rb.get_plugin_action(HZ / 14)
    end
    rect(GLOW, (W - 96) / 2, 26 + CH, 96, 120); rb.lcd_update(); rb.get_plugin_action(HZ / 8)
    trace("4 show #" .. n)
    local m = show_moe(n, twin and "IT HATCHED. A TWIN." or "IT HATCHED.")
    trace("5 shown #" .. n)
    local lines = {
        MYTHIC = "a mythic. from an egg. i'm shaking.", LEGENDARY = "legendary. i knew it was a good egg.",
        EPIC = "epic. it looks at you like you're its mom.", RARE = "rare. it's already judging your music.",
        COMMON = "a common. the best kind. it's perfect.",
    }
    rb.get_plugin_action(HZ)
    show_moe(n, lines[m.tier] or "hi.", "select: keep it")
    while true do
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SELECT_REL or a == A.PLA_UP or a == A.PLA_RIGHT then break end
    end
    trace("6 done #" .. n)
end

local function collection()
    if #mine == 0 then
        said = "nothing yet. it's still in there."
        return
    end
    local i = #mine
    while true do
        show_moe(mine[i], "MY MOES  " .. i .. " / " .. #mine)
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then i = i % #mine + 1
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then i = (i + #mine - 2) % #mine + 1
        elseif a == A.PLA_UP or a == A.PLA_LEFT or a == A.PLA_SELECT_REL then return end
    end
end

---------------------------------------------------------------- run
local HOLD = {
    "it's warm. it can hear your music.", "something in there likes this.", "don't shake it. ok, a little.",
    "it's listening. play it something.", "it kicked. eggs don't kick.", "it's dreaming in 320 by 240.",
}

local function main()
math.randomseed(rb.current_tick() + (os.time and os.time() or 0))
load()
if st.started == 0 then                       -- the very first time: count from now on, not old plays
    local f = io.open(LOG, "r")
    if f then st.pos = f:seek("end"); f:close() end
    st.started = 1
end
local was_off = log_on()
local got = listen()
if got >= 60 then said = "+" .. (got / 60) .. " min. it felt that."
elseif was_off then said = "i'm listening now. play music." end
save()
draw()
rb.get_plugin_action(HZ / 5)
while true do
    local a = rb.get_plugin_action(-1)
    if a == A.PLA_SELECT_REL then
        if st.warm >= need() then hatch() else said = pick(HOLD); wobble() end
        draw()
    elseif a == A.PLA_RIGHT then
        collection()
        draw()
    elseif a == A.PLA_UP or a == A.PLA_EXIT then
        break
    end
end
save()
end

-- if anything goes wrong, say so in colors you can read (and keep it in error.txt for the Mac)
local ok, err = pcall(main)
if not ok then
    err = tostring(err)
    local f = io.open(DIR .. "error.txt", "a")
    if f then f:write((os.time and os.time() or 0) .. " " .. err .. "\n"); f:close() end
    rect(BG, 0, 0, W, H)
    text(YOLK, "the egg glitched. it's ok.", "center", 6)
    local cols, y = (W - 16) / CW, 12 + CH * 2
    for i = 1, #err, cols do
        text(CREAM, err:sub(i, i + cols - 1), 8, y)
        y = y + CH + 2
        if y > H - CH * 3 then break end
    end
    text(DIM, "press select", "center", H - CH - 6)
    rb.lcd_update()
    while true do
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SELECT_REL or a == A.PLA_UP then break end
    end
end
rb.lcd_set_drawmode(3)
