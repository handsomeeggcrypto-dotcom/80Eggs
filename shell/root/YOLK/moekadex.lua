--[[ MOEKADEX // every moemoe LLC Moe, on SHELL
     wheel    browse          left/right   jump 50
     play     random Moe      select       full trait list
     hold select  type a number           menu         lists / exit

     The menu button opens the lists: rarest first, by trait, and My Moes (marked here,
     kept in mine.txt). The wheel then moves through that list. tools/gen_dex_index.py
     builds the lists.

     Other collections reuse this file: set a DEX table and dofile it (see
     dreams.lua). Anything DEX leaves out falls back to Moekadex's settings. ]]

require "actions"
dofile("/YOLK/usb.lua")  -- close and hand SHELL over when plugged in


local A = rb.actions
local W, H, HZ = rb.LCD_WIDTH, rb.LCD_HEIGHT, rb.HZ
local D = DEX or {}
local DIR = D.dir or "/YOLK/moekadex/"
local N = D.count or 5250
local ITEM = D.item or "MOE"                       -- "MOE #12", "JUMP TO MOE"
local TAGLINE = D.tagline or ("moemoe LLC . " .. N .. " moes")
local PIC_W, PIC_H = D.pic_w or 160, D.pic_h or 176
local UI = rb.FONT_UI

local function rgb(c, r, g, b) c = c or { r, g, b }; return rb.lcd_rgbpack(c[1], c[2], c[3]) end
local C = D.colors or {}
local NAVY   = rgb(C.bg, 6, 18, 74)               -- background
local BLUE   = rgb(C.bar, 4, 86, 250)             -- top and bottom bars
local YELLOW = rgb(C.accent, 255, 194, 26)        -- frames, highlights
local WHITE  = rgb(C.text, 242, 234, 219)
local DIM    = rgb(C.dim, 130, 160, 235)
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
local fallback = bmp(DIR .. (D.fallback or "bradley.bmp"))   -- shown while a picture loads

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

local PX = 10                                  -- where the picture goes
local PY = 36 + (176 - PIC_H) / 2              -- taller art sits a little higher

local list, pos = nil, 1                       -- the list being browsed, if any
local mine, is_mine = {}, {}                   -- My Moes

local function draw_main(m, pic, loading)
    bars(list and string.format("%d/%d", pos, list.count) or string.format("#%04d", m.n),
         "spin:browse  >:random  o:traits")
    -- picture in an accent-coloured frame
    rect(YELLOW, PX - 2, PY - 2, PIC_W + 4, PIC_H + 4)
    rect(NAVY, PX, PY, PIC_W, PIC_H)
    if pic then
        rb.lcd_bitmap(pic, PX, PY, PIC_W, PIC_H)
    else
        if fallback then blit(fallback, PX + (PIC_W - fallback:width()) / 2, PY + (PIC_H - fallback:height()) / 2 - 10) end
        if loading then text(DIM, "loading", PX, PY + PIC_H * 3 / 4, "center", PIC_W) end
    end
    -- info panel
    local x = PX + PIC_W + 14
    local cols = math.floor((W - x - 6) / CW)
    text(YELLOW, ITEM .. " #" .. m.n .. (is_mine[m.n] and " *" or ""), x, 36)
    local tcol = TIER[m.tier] or WHITE
    local tw = rb.font_getstringsize(" " .. m.tier .. " ", UI)
    rect(tcol, x, 56, tw, CH + 2)
    text(NAVY, " " .. m.tier .. " ", x, 57)
    text(WHITE, "RANK " .. m.rank, x, 80)
    text(DIM, list and fit(list.name, cols) or ("of " .. N), x, 96)
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
        text(YELLOW, "JUMP TO " .. ITEM, 50, 80, "center", 220)
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

---------------------------------------------------------------- lists
local PLURAL = ITEM:lower() .. "s"             -- "moes", "dreams"
local IDX = DIR .. "index/"
local MINE = DIR .. "mine.txt"
local rarest_file = io.open(IDX .. "rarest.txt", "rb")
local moes_file = io.open(IDX .. "moes.txt", "rb")
local values_file = io.open(IDX .. "values.txt", "rb")
local value_len, types = 0, {}
do
    local f = io.open(IDX .. "types.txt", "r")
    if f then
        value_len = tonumber(f:read("*l")) or 0
        for line in f:lines() do
            local t = split(line, "|")
            types[#types + 1] = { name = t[1], first = tonumber(t[2]), count = tonumber(t[3]) }
        end
        f:close()
    end
end

local function num_at(f, i)                    -- the i-th (from 0) "nnnn\n" record
    f:seek("set", i * 5)
    return tonumber(f:read(4)) or 1
end

local function value_at(i)                     -- the i-th (from 0) record of values.txt
    values_file:seek("set", i * value_len)
    local t = split((values_file:read(value_len - 1) or ""):gsub("%s+$", ""), "|")
    return { name = t[1] or "?", pct = t[2] or "", count = tonumber(t[3]) or 0, first = tonumber(t[4]) or 0 }
end

local function load_mine()
    local f = io.open(MINE, "r")
    if not f then return end
    for line in f:lines() do
        local v = tonumber(line)
        if v and v >= 1 and v <= N and not is_mine[v] then
            is_mine[v] = true
            mine[#mine + 1] = v
        end
    end
    f:close()
    table.sort(mine)
end

local function toggle_mine(v)
    if is_mine[v] then
        is_mine[v] = nil
        for i = #mine, 1, -1 do if mine[i] == v then table.remove(mine, i) end end
    else
        is_mine[v] = true
        mine[#mine + 1] = v
        table.sort(mine)
    end
    local f = io.open(MINE, "w")
    if f then
        for _, x in ipairs(mine) do f:write(x .. "\n") end
        f:close()
    end
end

local function mine_list()
    return { name = "my " .. PLURAL, count = #mine, at = function(i) return mine[i] end }
end

-- a scrolling list; returns the picked row, or nil for the menu button
local function picker(right, hint, count, row)
    local sel, top = 1, 1
    local rows = math.floor((H - 23 - 34) / (CH + 8))
    while true do
        if sel < top then top = sel elseif sel >= top + rows then top = sel - rows + 1 end
        bars(right, hint)
        for i = 0, rows - 1 do
            local r = top + i
            if r <= count then
                local y = 34 + i * (CH + 8)
                local left, tail = row(r)
                tail = tail or ""
                if r == sel then rect(YELLOW, 6, y - 2, W - 16, CH + 6) end
                local cols = math.floor((W - 34) / CW) - #tail - 1
                text(r == sel and NAVY or WHITE, fit(left, cols), 12, y)
                if tail ~= "" then text(r == sel and NAVY or YELLOW, tail, 0, y, "right", W - 16) end
            end
        end
        if count > rows then
            local track = H - 23 - 34 - 4
            local h = math.max(8, track * rows / count)
            rect(BLUE, W - 6, 34, 3, track)
            rect(YELLOW, W - 6, 34 + (track - h) * (top - 1) / (count - rows), 3, h)
        end
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then
            sel = sel % count + 1
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then
            sel = (sel + count - 2) % count + 1
        elseif a == A.PLA_SELECT_REL then
            return sel
        elseif a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then
            return nil
        end
    end
end

-- trait type, then value; returns a list of the Moes that have it, or nil
local function pick_trait()
    while true do
        local t = picker("traits", "spin:pick  o:open  menu:back", #types,
                         function(r) return types[r].name, tostring(types[r].count) end)
        if not t then return nil end
        local ty = types[t]
        local v = picker(fit(ty.name, 18), "spin:pick  o:open  menu:back", ty.count, function(r)
            local x = value_at(ty.first + r - 1)
            return x.name, x.pct
        end)
        if v then
            local x = value_at(ty.first + v - 1)
            return { name = x.name, count = x.count, at = function(i) return num_at(moes_file, x.first + i - 1) end }
        end
    end
end

-- the menu button. Returns "leave", a list, "all", or nil to carry on as you were
local function lists_menu(n)
    while true do
        local items, acts = {}, {}
        local function add(label, tail, act) items[#items + 1] = { label, tail }; acts[#acts + 1] = act end
        add("keep browsing", nil, "back")
        if list then add("all " .. PLURAL, tostring(N), "all") end
        if rarest_file then add("rarest first", nil, "rarest") end
        if #types > 0 and values_file and moes_file then add("by trait", nil, "trait") end
        add("my " .. PLURAL, tostring(#mine), "mine")
        add((is_mine[n] and "remove #" or "add #") .. n .. (is_mine[n] and " from mine" or " to mine"), nil, "toggle")
        local c = picker("menu", "spin:pick  o:go  menu:leave", #items,
                         function(r) return items[r][1], items[r][2] end)
        if not c then return "leave" end
        local act = acts[c]
        if act == "back" then return nil
        elseif act == "all" then return "all"
        elseif act == "rarest" then
            return { name = "rarest first", count = N, at = function(i) return num_at(rarest_file, i - 1) end }
        elseif act == "trait" then
            local l = pick_trait()
            if l then return l end
        elseif act == "mine" then
            if #mine > 0 then return mine_list() end
            picker("my " .. PLURAL, "menu:back", 2, function(r)
                return r == 1 and ("none yet. pick add #" .. n) or "in this menu to mark one"
            end)
        else
            toggle_mine(n)
            return "toggled"
        end
    end
end

---------------------------------------------------------------- splash
local function splash()
    local s = rb.read_bmp_file(DIR .. "splash.bmp", false, false)
    if s then rb.lcd_bitmap(s, 0, 0, W, H) else rect(BLUE, 0, 0, W, H) end
    text(D.tagline_color and rgb(D.tagline_color) or WHITE, TAGLINE, 0, 206, "center", W)
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

load_mine()
local n = load_last()
YOLK_ON_USB = function() save_last(n) end  -- remember your place if you plug in mid-browse
local m = moe(n)
local pic = nil
local need_pic = true
draw_main(m, nil, true)

local function go(to)
    if list then                               -- `to` is a place in the list
        if to < 1 or to > list.count then to = (to - 1) % list.count + 1 end
        pos = to
        n = list.at(pos)
    else
        if to < 1 then to = to + N elseif to > N then to = to - N end
        n = to
    end
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
    local here = list and pos or n
    if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then
        go(here + 1)
    elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then
        go(here - 1)
    elseif a == A.PLA_RIGHT or a == A.PLA_RIGHT_REPEAT then
        go(here + 50)
    elseif a == A.PLA_LEFT or a == A.PLA_LEFT_REPEAT then
        go(here - 50)
    elseif a == A.PLA_DOWN then
        go(math.random(1, list and list.count or N))
    elseif a == A.PLA_SELECT_REL then
        traits_screen(m)
        draw_main(m, pic, need_pic)
    elseif a == A.PLA_SELECT_REPEAT then
        local to = jump_screen(n)
        if to ~= n then list = nil end         -- a typed number means the whole dex again
        if list then draw_main(m, pic, need_pic) else go(to) end
        -- swallow the select release from the long press
        rb.get_plugin_action(HZ / 4)
    elseif a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then
        local r = lists_menu(n)
        if r == "leave" then break
        elseif r == "all" then list = nil; go(n)
        elseif r == "toggled" then
            if list and list.name == "my " .. PLURAL then   -- the list you're in just changed
                if #mine == 0 then list = nil; go(n)
                else list = mine_list(); go(math.min(pos, #mine)) end
            else
                draw_main(m, pic, need_pic)
            end
        elseif r then list = r; go(1)
        else draw_main(m, pic, need_pic) end
    elseif need_pic then
        pic = rb.read_bmp_file(picture_path(n), false, false)
        need_pic = false
        draw_main(m, pic)
    end
end

save_last(n)
for _, f in ipairs({ data, rarest_file, moes_file, values_file }) do f:close() end
rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
