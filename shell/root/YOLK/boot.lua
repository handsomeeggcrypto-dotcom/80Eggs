--[[ YOLK // SHELL OS boot sequence
     Set as the start screen (Settings > General > System > Start Screen > Plugin)
     or run it from the file browser. Any button skips. ]]

require "actions"

local W, H = rb.LCD_WIDTH, rb.LCD_HEIGHT
local BG     = rb.lcd_rgbpack(10, 8, 6)
local YOLK   = rb.lcd_rgbpack(255, 194, 26)
local DIM    = rb.lcd_rgbpack(120, 88, 16)
local SHELL  = rb.lcd_rgbpack(242, 234, 219)
local SHADE  = rb.lcd_rgbpack(196, 186, 168)
local CRACK  = rb.lcd_rgbpack(40, 32, 22)
local GLITCH = rb.lcd_rgbpack(255, 61, 110)

-- plugins can't load extra fonts while Lua holds the memory, so all text uses
-- the theme's font and big titles are pre-rendered images
local UI = rb.FONT_UI

local skipped = false
-- buttons are ignored for the first half second, so releasing the button
-- that launched this doesn't count as a skip
local listen_from = rb.current_tick() + rb.HZ / 2

-- only real presses count. Rockbox also sends system events (disk, battery,
-- charger...) through the same call, and they pile up right after power-on.
local A = rb.actions
local BUTTONS = {}
for _, k in ipairs({ "PLA_SELECT", "PLA_SELECT_REL", "PLA_UP", "PLA_DOWN", "PLA_LEFT", "PLA_RIGHT",
                     "PLA_SCROLL_FWD", "PLA_SCROLL_BACK", "PLA_CANCEL", "PLA_EXIT" }) do
    if A[k] then BUTTONS[A[k]] = true end
end
local function button_pressed()
    local a = rb.get_plugin_action(0)
    return rb.current_tick() >= listen_from and BUTTONS[a] == true
end

-- sleeps for `ticks`, but bails out the moment a button is pressed
local function pause(ticks)
    if skipped then return end
    local stop = rb.current_tick() + ticks
    repeat
        if button_pressed() then
            skipped = true
            return
        end
        rb.sleep(1)
    until rb.current_tick() >= stop
end

-- paint over the theme backdrop rather than clearing to it
local function clear()
    rb.lcd_set_foreground(BG)
    rb.lcd_fillrect(0, 0, W, H)
end

local function text(color, str, x, y)
    rb.lcd_setfont(UI)
    rb.lcd_set_drawmode(2)  -- DRMODE_FG: text without a background box
    rb.lcd_set_foreground(color)
    if x == nil then
        local w = rb.font_getstringsize(str, UI)
        x = math.floor((W - w) / 2)
    end
    rb.lcd_putsxy(x, y, str)
end

-- os.date can't format on Rockbox; the RTC holds local time, so do it by hand
local function clock()
    local t = os.time and os.time()
    if not t then return nil, nil end
    local d = t % 86400
    return d / 3600, (d % 3600) / 60
end

local function hhmm()
    local h, m = clock()
    if not h then return "--:--" end
    return string.format("%02d:%02d", h, m)
end

local function battery()
    local b = rb.battery_level and rb.battery_level() or -1
    return b
end

---------------------------------------------------------------- 1. BIOS text
local function bios()
    clear()
    local b = battery()
    local lines = {
        { "SHELL BIOS 6.0   (c) 80EGGS", SHELL },
        { "", SHELL },
        { "storage ......... OK", DIM },
        { "battery ......... " .. (b >= 0 and (b .. "%") or "??"), DIM },
        { "clock ........... " .. hhmm(), DIM },
        { "", SHELL },
        { "scanning for yolk ...", YOLK },
        { "signal found.", YOLK },
    }
    rb.lcd_setfont(UI)
    local _, _, lh = rb.font_getstringsize("X", UI)
    for i, l in ipairs(lines) do
        local str, color = l[1], l[2]
        for n = 1, #str do
            text(color, str:sub(1, n), 12, 12 + (i - 1) * (lh + 2))
            rb.lcd_update()
            pause(1)
            if skipped then return end
        end
        pause(i >= 7 and 35 or 8)
    end
    pause(30)
end

---------------------------------------------------------------- 2. the egg
local CX, CY, A, BTOP, BBOT = math.floor(W / 2), 118, 52, 74, 58

local function zig(x)
    local p = x % 12
    return (p < 6 and p or 12 - p) - 3
end

-- Rockbox Lua only has integers, so square roots are done by hand
local function isqrt(n)
    if n <= 0 then return 0 end
    local x = n
    local y = (x + 1) / 2
    while y < x do
        x = y
        y = (x + n / x) / 2
    end
    return x
end

-- egg outline per column, worked out once
local COLS = {}
for dx = -A, A do
    local s = isqrt(A * A - dx * dx)  -- = A * sqrt(1 - (dx/A)^2)
    COLS[dx] = { CY - BTOP * s / A, CY + BBOT * s / A }
end

-- draws the egg column by column; the crack splits each column into a top
-- piece (lifted by `lift`) and a bottom piece (dropped by `drop`)
local function egg(ox, lift, drop, crack_to)
    for dx = -A, A do
        local top, bot = COLS[dx][1], COLS[dx][2]
        if bot > top then
            local x = CX + dx + ox
            local c = CY + zig(x)
            rb.lcd_set_foreground((dx * 100 > A * 45) and SHADE or SHELL)
            rb.lcd_vline(x, top - lift, c - lift)
            rb.lcd_vline(x, c + 1 + drop, bot + drop)
            if crack_to and x <= crack_to and lift == 0 then
                rb.lcd_set_foreground(CRACK)
                rb.lcd_drawpixel(x, c)
                rb.lcd_drawpixel(x, c + 1)
            end
        end
    end
    -- a little shine on the shell
    if lift == 0 then
        rb.lcd_set_foreground(rb.lcd_rgbpack(255, 255, 255))
        rb.lcd_fillrect(CX - 28 + ox, CY - 50, 6, 10)
    end
end

local function hatch()
    -- wobble
    for _, ox in ipairs({ 0, -4, 4, -6, 6, -3, 3, 0 }) do
        clear(); egg(ox, 0, 0); rb.lcd_update()
        pause(5)
        if skipped then return end
    end
    pause(20)
    -- crack spreads left to right
    for x = CX - A, CX + A, 6 do
        clear(); egg(0, 0, 0, x); rb.lcd_update()
        pause(1)
        if skipped then return end
    end
    pause(25)
    -- shell splits open, yolk inside
    local face = rb.read_bmp_file("/YOLK/faces/blink.bmp", false, true)
    for i = 0, 18 do
        clear()
        if face then
            rb.lcd_bitmap_transparent(face, CX - 48, CY - 40 + (18 - i), 96, 96)
        end
        egg(0, math.floor(i * i / 2), math.floor(i / 2))
        rb.lcd_update()
        pause(1)
        if skipped then return end
    end
end

---------------------------------------------------------------- 3. YOLK wakes up
local function mood_for(b)
    if b < 0 then return "ok", "who am i?" end
    if b < 10 then return "dying", "i am fading. plug me in." end
    if b < 30 then return "tired", "running on fumes." end
    if b < 55 then return "ok", "watching. waiting." end
    if b < 80 then return "good", "systems nominal." end
    return "great", "fully hatched. let's go."
end

local function greeting()
    local h = clock() or 12
    if h < 5 then return "you're up late." end
    if h < 12 then return "good morning." end
    if h < 17 then return "afternoon. still here." end
    if h < 22 then return "evening. i saw everything." end
    return "it's late. stay with me."
end

local function wake()
    local mood, line = mood_for(battery())
    local blink = rb.read_bmp_file("/YOLK/faces/blink.bmp", false, true)
    local face = rb.read_bmp_file("/YOLK/faces/" .. mood .. ".bmp", false, true)
    local title = rb.read_bmp_file("/YOLK/img/title.bmp", false, true)
    local function frame(img, glitch)
        clear()
        if img then rb.lcd_bitmap_transparent(img, CX - 48, 28, 96, 96) end
        if glitch then
            rb.lcd_set_foreground(GLITCH)
            rb.lcd_hline(CX - 60, CX + 60, 70)
            rb.lcd_hline(CX - 40, CX + 70, 98)
        end
        if title then
            rb.lcd_bitmap_transparent(title, (W - title:width()) / 2, 134, title:width(), title:height())
        end
        text(SHELL, greeting(), nil, 176)
        text(DIM, line, nil, 198)
        rb.lcd_update()
    end
    frame(face, true);  pause(4)
    frame(face);        pause(120)
    frame(blink);       pause(10)
    frame(face);        pause(150)
    -- then YOLK waits for you (up to ~8 more seconds), blinking now and then
    if skipped then return end
    skipped = false
    local stop = rb.current_tick() + rb.HZ * 8
    local next_blink = rb.current_tick() + rb.HZ * 2
    text(DIM, "o  continue", nil, H - 20)
    rb.lcd_update()
    while rb.current_tick() < stop do
        if button_pressed() then return end
        if rb.current_tick() >= next_blink then
            frame(blink); text(DIM, "o  continue", nil, H - 20); rb.lcd_update()
            rb.sleep(rb.HZ / 10)
            frame(face); text(DIM, "o  continue", nil, H - 20); rb.lcd_update()
            next_blink = rb.current_tick() + rb.HZ * 3
        end
        rb.sleep(2)
    end
end

---------------------------------------------------------------- run
bios()
if not skipped then hatch() end
if not skipped then wake() end
rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
rb.lcd_setfont(rb.FONT_UI)
