--[[ MOEKADEX // every moemoe LLC Moe, on SHELL
     wheel    browse          left/right   jump 50
     play     random Moe      select       full trait list
     hold select  type a number           menu         back / exit ]]

require "actions"

local A = rb.actions
local W, H, HZ = rb.LCD_WIDTH, rb.LCD_HEIGHT, rb.HZ
local DIR = "/YOLK/moekadex/"
local N = 5250
local UI = rb.FONT_UI

local NAVY   = rb.lcd_rgbpack(6, 18, 74)
local BLUE   = rb.lcd_rgbpack(4, 86, 250)
local YELLOW = rb.lcd_rgbpack(255, 194, 26)
local WHITE  = rb.lcd_rgbpack(242, 234, 219)
local DIM    = rb.lcd_rgbpack(130, 160, 235)
local BROWN  = rb.lcd_rgbpack(106, 62, 0)
local TIER = {
    MYTHIC    = rb.lcd_rgbpack(255, 61, 110),
    LEGENDARY = YELLOW,
    EPIC      = rb.lcd_rgbpack(190, 110, 255),
    RARE      = rb.lcd_rgbpack(61, 245, 255),
    COMMON    = rb.lcd_rgbpack(150, 160, 190),
}

---------------------------------------------------------------- drawing helpers
local _, CW, CH = rb.font_getstringsize("M", UI)  -- (width, w, h); the theme font is monospace

local function rect(color, x, y, w, h)
    rb.lcd_set_foreground(color)
    rb.lcd_fillrect(x, y, w, h)
end

local function text(color, str, x, y, align, width)
    rb.lcd_setfont(UI)
    rb.lcd_set_drawmode(2)  -- DRMODE_FG: no background box behind text
    rb.lcd_set_foreground(color)
    if align then
        local w = rb.font_getstringsize(str, UI)
        if align == "right" then x = x + width - w
        elseif align == "center" then x = x + (width - w) / 2 end
    end
    rb.lcd_putsxy(x, y, str)
end

local function fit(str, chars)
    if #str <= chars then return str end
    return str:sub(1, chars - 1) .. "~"
end

local function bmp(path)
    local img = rb.read_bmp_file(path, false, true)
    return img
end

local function blit(img, x, y)
    if img then rb.lcd_bitmap_transparent(img, x, y, img:width(), img:height()) end
end

---------------------------------------------------------------- data
local reclen
do
    local f = io.open(DIR .. "reclen.txt", "r")
    reclen = f and tonumber(f:read("*l")) or 0
    if f then f:close() end
end
local data = io.open(DIR .. "data.txt", "rb")

local function split(s, sep)
    local out = {}
    for part in (s .. sep):gmatch("(.-)" .. sep:gsub("%p", "%%%0")) do out[#out + 1] = part end
    return out
end

-- reads Moe n's record: rank, tier and its traits, rarest first
local function moe(n)
    local m = { n = n, rank = "?", tier = "COMMON", traits = {} }
    if not data or reclen == 0 then return m end
    data:seek("set", (n - 1) * reclen)
    local line = data:read(reclen - 1)
    if not line then return m end
    line = line:gsub("%s+$", "")
    local f = split(line, "|")
    m.rank, m.tier = f[1], f[2]
    for i = 3, #f do
        local t = split(f[i], "~")
        m.traits[#m.traits + 1] = { type = t[1], value = t[2], pct = t[3] }
    end
    return m
end

local function picture_path(n)
    return DIR .. "img/" .. tostring((n - 1) / 500) .. "/" .. n .. ".bmp"
end

---------------------------------------------------------------- screens
local title = bmp(DIR .. "title.bmp")
local bradley = bmp(DIR .. "bradley.bmp")

local function bars(right_text, hint)
    rect(NAVY, 0, 0, W, H)
    rect(BLUE, 0, 0, W, 28)
    rect(YELLOW, 0, 28, W, 1)
    blit(title, 8, 2)
    if right_text then text(WHITE, right_text, 0, 6, "right", W - 8) end
    rect(BLUE, 0, H - 22, W, 22)
    rect(YELLOW, 0, H - 23, W, 1)
    text(WHITE, hint, 0, H - 19, "center", W)
end

local PX, PY = 10, 36  -- where the picture goes

local function draw_main(m, pic, loading)
    bars(string.format("#%04d", m.n), "spin:browse  >:random  o:traits")
    -- picture in a yellow frame
    rect(YELLOW, PX - 2, PY - 2, 164, 180)
    rect(NAVY, PX, PY, 160, 176)
    if pic then
        rb.lcd_bitmap(pic, PX, PY, 160, 176)
    else
        blit(bradley, PX + 48, PY + 56)
        if loading then text(DIM, "loading", PX, PY + 128, "center", 160) end
    end
    -- info panel
    local x, cols = 184, math.floor((W - 184 - 6) / CW)
    text(YELLOW, "MOE #" .. m.n, x, 36)
    local tcol = TIER[m.tier] or WHITE
    local tw = rb.font_getstringsize(" " .. m.tier .. " ", UI)
    rect(tcol, x, 56, tw, CH + 2)
    text(NAVY, " " .. m.tier .. " ", x, 57)
    text(WHITE, "RANK " .. m.rank, x, 80)
    text(DIM, "of " .. N, x, 96)
    text(DIM, "RAREST", x, 124)
    for i = 1, 2 do
        local t = m.traits[i]
        if t then
            local y = 142 + (i - 1) * 34
            text(WHITE, fit(t.value, cols), x, y)
            text(YELLOW, fit(t.pct .. " " .. t.type, cols), x, y + CH)
        end
    end
    rb.lcd_update()
end

local function traits_screen(m)
    local top = 1
    local rows = math.floor((H - 23 - 32) / (CH * 2 + 4))
    while true do
        bars(string.format("#%04d", m.n), "spin:scroll  menu:back")
        local cols = math.floor((W - 20) / CW)
        for i = 0, rows - 1 do
            local t = m.traits[top + i]
            if t then
                local y = 34 + i * (CH * 2 + 4)
                text(WHITE, fit(t.value, cols - #t.pct - 1), 10, y)
                text(YELLOW, t.pct, 0, y, "right", W - 10)
                text(DIM, t.type, 10, y + CH)
            end
        end
        -- scroll position
        if #m.traits > rows then
            local track = H - 23 - 34 - 4
            local h = math.max(8, track * rows / #m.traits)
            local y = 34 + (track - h) * (top - 1) / (#m.traits - rows)
            rect(BLUE, W - 4, 34, 3, track)
            rect(YELLOW, W - 4, y, 3, h)
        end
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then
            if top + rows <= #m.traits then top = top + 1 end
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then
            if top > 1 then top = top - 1 end
        elseif a == A.PLA_UP or a == A.PLA_SELECT_REL or a == A.PLA_LEFT
            or a == A.PLA_CANCEL or a == A.PLA_EXIT then
            return
        end
    end
end

-- dial in a Moe number one digit at a time
local function jump_screen(n)
    local digits = { math.floor(n / 1000) % 10, math.floor(n / 100) % 10, math.floor(n / 10) % 10, n % 10 }
    local pos = 1
    while true do
        rect(NAVY, 50, 70, 220, 100)
        rect(YELLOW, 50, 70, 220, 2); rect(YELLOW, 50, 168, 220, 2)
        rect(YELLOW, 50, 70, 2, 100); rect(YELLOW, 268, 70, 2, 100)
        text(YELLOW, "JUMP TO MOE", 50, 80, "center", 220)
        local x0 = 160 - (CW * 2 + 6) * 2
        for i = 1, 4 do
            local x = x0 + (i - 1) * (CW * 2 + 6) + CW / 2
            if i == pos then rect(YELLOW, x - 4, 108, CW + 8, CH + 8) end
            text(i == pos and NAVY or WHITE, tostring(digits[i]), x, 112)
        end
        text(DIM, "spin:digit  <>:move  o:go", 50, 146, "center", 220)
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then
            digits[pos] = (digits[pos] + 1) % 10
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then
            digits[pos] = (digits[pos] + 9) % 10
        elseif a == A.PLA_RIGHT then
            pos = pos % 4 + 1
        elseif a == A.PLA_LEFT then
            pos = (pos + 2) % 4 + 1
        elseif a == A.PLA_SELECT_REL then
            local v = digits[1] * 1000 + digits[2] * 100 + digits[3] * 10 + digits[4]
            if v < 1 then v = 1 elseif v > N then v = N end
            return v
        elseif a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then
            return n
        end
    end
end

---------------------------------------------------------------- splash
local function splash()
    local s = rb.read_bmp_file(DIR .. "splash.bmp", false, false)
    if s then rb.lcd_bitmap(s, 0, 0, W, H) else rect(BLUE, 0, 0, W, H) end
    text(WHITE, "moemoe LLC . " .. N .. " moes", 0, 206, "center", W)
    rb.lcd_update()
    s = nil
    local stop = rb.current_tick() + HZ * 3 / 2
    while rb.current_tick() < stop do
        local a = rb.get_plugin_action(HZ / 20)
        if a ~= A.ACTION_NONE and a ~= A.ACTION_UNKNOWN and a >= 0 then break end
    end
end

---------------------------------------------------------------- main loop
local LAST = DIR .. "last.txt"

local function load_last()
    local f = io.open(LAST, "r")
    local n = f and tonumber(f:read("*l"))
    if f then f:close() end
    if not n or n < 1 or n > N then n = 1 end
    return n
end

local function save_last(n)
    local f = io.open(LAST, "w")
    if f then f:write(tostring(n) .. "\n"); f:close() end
end

splash()
math.randomseed(rb.current_tick() + (os.time and os.time() or 0))

local n = load_last()
local m = moe(n)
local pic = nil
local need_pic = true
draw_main(m, nil, true)

local function go(to)
    if to < 1 then to = to + N elseif to > N then to = to - N end
    n = to
    m = moe(n)
    pic = nil
    collectgarbage()
    need_pic = true
    draw_main(m, nil, true)
end

while true do
    -- while the wheel is spinning only the text updates; the picture loads
    -- once it settles, so browsing stays quick
    local a = rb.get_plugin_action(need_pic and HZ / 6 or -1)
    if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then
        go(n + 1)
    elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then
        go(n - 1)
    elseif a == A.PLA_RIGHT or a == A.PLA_RIGHT_REPEAT then
        go(n + 50)
    elseif a == A.PLA_LEFT or a == A.PLA_LEFT_REPEAT then
        go(n - 50)
    elseif a == A.PLA_DOWN then
        go(math.random(1, N))
    elseif a == A.PLA_SELECT_REL then
        traits_screen(m)
        draw_main(m, pic, need_pic)
    elseif a == A.PLA_SELECT_REPEAT then
        go(jump_screen(n))
        -- swallow the select release from the long press
        rb.get_plugin_action(HZ / 4)
    elseif a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then
        break
    elseif need_pic then
        pic = rb.read_bmp_file(picture_path(n), false, false)
        need_pic = false
        draw_main(m, pic)
    end
end

save_last(n)
if data then data:close() end
rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
