--[[ QUEST LOG // real life, with loot
     spin   scroll      select   pick / check off      menu   back
     << >>  (money goals) change the step

     Lists live in /YOLK/quests/list.txt (copied from starter.txt the first time).
     Edit it on the Mac while SHELL is plugged in. Quests are remembered by
     list name + words, so renaming one starts it fresh.

     Every quest done, and every 10% of a goal, is a "package": it drops an engram
     that opens into gear (common to exotic). Every 10 packages ranks you up and
     drops a guaranteed exotic. Finishing a whole list drops a legendary or better.
     Loot is only ever given once per quest step, so unchecking can't farm it.

     "~" lines are dailies: loot once a day, reset tomorrow, never punished for
     missing. "@stat" trains one of six stats (a level every 5). WHAT NOW? picks
     one open quest for you.

     Progress, rank and the vault are saved in /YOLK/quests/state.txt. ]]

require "actions"
dofile("/YOLK/usb.lua")  -- close and hand SHELL over when plugged in

local A = rb.actions
local W, H, HZ = rb.LCD_WIDTH, rb.LCD_HEIGHT, rb.HZ
local UI = rb.FONT_UI
local _, CW, CH = rb.font_getstringsize("M", UI)  -- (width, w, h)
local DIR = "/YOLK/quests/"

local function rgb(r, g, b) return rb.lcd_rgbpack(r, g, b) end
local C = {
    bg = rgb(8, 8, 0), panel = rgb(22, 18, 12), yolk = rgb(255, 194, 26), dim = rgb(138, 100, 16),
    text = rgb(242, 234, 219), red = rgb(255, 90, 90), green = rgb(110, 230, 140), white = rgb(255, 255, 255),
    track = rgb(58, 46, 22),
}

---------------------------------------------------------------- loot tables
local RARITY = {   -- weight = chance out of 100 on a normal drop
    { name = "COMMON",    color = rgb(205, 205, 205), dark = rgb(70, 70, 70),   weight = 50, power = 3 },
    { name = "UNCOMMON",  color = rgb(110, 230, 140), dark = rgb(30, 90, 50),   weight = 28, power = 5 },
    { name = "RARE",      color = rgb(90, 160, 255),  dark = rgb(25, 55, 110),  weight = 14, power = 8 },
    { name = "LEGENDARY", color = rgb(196, 120, 255), dark = rgb(70, 30, 110),  weight = 7,  power = 13 },
    { name = "EXOTIC",    color = rgb(255, 214, 40),  dark = rgb(120, 90, 0),   weight = 1,  power = 30 },
}
local GEAR = { "Spatula", "Whisk", "Frying Pan", "Carton Shield", "Shell Plate", "Yolk Blaster", "Hoodie",
    "Visor", "Sneakers", "Cape", "Gloves", "Toolbelt", "Hard Hat", "Wrench", "Lunchbox", "Piggy Bank",
    "Moe Plush", "Scarf", "Ladder", "Hammer", "Mug", "Backpack", "Goggles", "Boots" }
local PREFIX = {
    { "Plain", "Store Brand", "Dented", "Slightly Used", "Beige", "Basic" },
    { "Free-Range", "Polished", "Sturdy", "Handy", "Brand New", "Trusty" },
    { "Hatched", "Glowing", "Double Yolk", "Sunny", "Overclocked", "Lucky" },
    { "Golden", "Hard-Boiled", "Midnight", "Sovereign", "Moemoe", "Ancient" },
}
local EXOTICS = {
    { "The Golden Yolk", "it hums when nobody looks." },
    { "Eggcalibur", "pulled from a carton of stone." },
    { "Omelette of Ages", "still warm. somehow." },
    { "YOLK's Spare Eye", "she would like it back." },
    { "Debt Slayer", "forged from minimum payments." },
    { "The Last Gutter", "rain fears it." },
    { "Crown of Moe", "heavy is the head." },
    { "Infinite Toast", "never burns. never ends." },
    { "Shell of the Ancients", "older than the iPod." },
    { "The Kitchen Sink", "everything, and also this." },
    { "Piggy Bank Prime", "it oinks in dollars." },
    { "Night Shift Thermos", "coffee that remembers you." },
    { "Sunny Side Visor", "the future looks bright." },
    { "Hidden Package", "you found it. it found you." },
    { "Cosmic Carton", "holds a dozen small stars." },
}
local RANKS = { "Raw Egg", "Fresh Egg", "Soft Boiled", "Over Easy", "Sunny Side Up", "Hard Boiled",
    "Deviled", "Scrambler", "Eggs Benedict", "Golden Yolk", "Egg Legend", "YOLK's Favorite" }
local function rank_name(pk)
    local r = math.floor(pk / 10) + 1
    if r <= #RANKS then return RANKS[r] end
    return RANKS[#RANKS] .. " +" .. (r - #RANKS)
end
local function flavor(name)
    for _, e in ipairs(EXOTICS) do if e[1] == name then return e[2] end end
end

---------------------------------------------------------------- drawing
local function rect(c, x, y, w, h) rb.lcd_set_foreground(c); rb.lcd_fillrect(x, y, w, h) end
local function text(c, s, x, y, align)
    rb.lcd_setfont(UI); rb.lcd_set_drawmode(2); rb.lcd_set_foreground(c)
    local w = rb.font_getstringsize(s, UI)
    if align == "right" then x = x - w elseif align == "center" then x = x - w / 2 end
    rb.lcd_putsxy(x, y, s)
end
local function fit(s, chars) return #s <= chars and s or (s:sub(1, chars - 1) .. "~") end
local function money(n)
    local s = tostring(n < 0 and -n or n)
    while true do
        local a, b = s:match("^(%d+)(%d%d%d.*)$")
        if not a then break end
        s = a .. "," .. b
    end
    return (n < 0 and "-$" or "$") .. s
end
local function bar(x, y, w, h, tenths, c)   -- tenths 0..10
    rect(C.track, x, y, w, h)
    if tenths > 0 then rect(c or C.yolk, x, y, w * tenths / 10, h) end
end
local function diamond(cx, cy, r, c)
    rb.lcd_set_foreground(c)
    for dy = -r, r do
        local w = r - (dy < 0 and -dy or dy)
        rb.lcd_fillrect(cx - w, cy + dy, w * 2 + 1, 1)
    end
end
local function is_button(a)   -- real presses only, not Rockbox's system events
    return a == A.PLA_SELECT_REL or a == A.PLA_RIGHT or a == A.PLA_LEFT or a == A.PLA_UP
        or a == A.PLA_DOWN or a == A.PLA_CANCEL or a == A.PLA_EXIT
end
local function wait_button()
    rb.get_plugin_action(HZ / 5)
    while true do
        local a = rb.get_plugin_action(-1)
        if is_button(a) then return a end
    end
end
local faces = {}
local function draw_face(name, cx, cy)
    if faces[name] == nil then
        faces[name] = rb.read_bmp_file("/YOLK/talk/faces/" .. name .. ".bmp", false, true) or false
    end
    if faces[name] then rb.lcd_bitmap_transparent(faces[name], cx - 36, cy - 36, 72, 72) end
end

---------------------------------------------------------------- the quest list
local function clean(s)
    -- TextEdit may save curly quotes and dashes; SHELL's font only has plain ones
    s = s:gsub("\r", ""):gsub("\226\128[\152\153]", "'"):gsub("\226\128[\156\157]", '"')
    s = s:gsub("\226\128[\147\148]", "-"):gsub("[\128-\255]", "")
    return s:match("^%s*(.-)%s*$")
end

local function read_file(path)
    local f = io.open(path, "r")
    if not f then return nil end
    local s = f:read("*a")
    f:close()
    return s
end

-- the six stats. "@word" at the end of a list or quest line picks one.
local STATS = { "WEALTH", "MIND", "BODY", "CREATIVITY", "KNOWLEDGE", "BONDS" }
local ALIAS = { money = 1, debt = 1, save = 1, work = 1, meditate = 2, calm = 2, health = 3, fit = 3,
    sleep = 3, house = 3, home = 3, create = 4, art = 4, code = 4, music = 4, guitar = 4, game = 4,
    build = 4, learn = 5, read = 5, study = 5, love = 6, family = 6, friends = 6, people = 6,
    relationships = 6, cats = 6 }
local function find_stat(word)
    word = word:lower()
    for i, s in ipairs(STATS) do if s:lower():sub(1, 3) == word:sub(1, 3) then return i end end
    return ALIAS[word]
end
local function take_stat(line)   -- "fix the gutters @body" -> "fix the gutters", 3
    local word = line:match("@(%a+)%s*$")
    if not word then return line end
    return clean(line:gsub("@%a+%s*$", "")), find_stat(word)
end

local lists = {}
local function load_lists()
    local s = read_file(DIR .. "list.txt")
    if not s then
        s = read_file(DIR .. "starter.txt") or ""
        local f = io.open(DIR .. "list.txt", "w")
        if f then f:write(s); f:close() end
    end
    local cur
    for line in (s .. "\n"):gmatch("(.-)\n") do
        line = clean(line)
        if line == "" or line:sub(1, 1) == "#" then
            -- note
        elseif line:sub(1, 2) == "==" then
            local name, stat = take_stat(clean(line:sub(3)))
            cur = { name = name:upper(), items = {}, stat = stat }
            if cur.name == "" then cur.name = "QUESTS" end
            lists[#lists + 1] = cur
        else
            if not cur then cur = { name = "QUESTS", items = {} }; lists[#lists + 1] = cur end
            local daily = line:sub(1, 1) == "~"
            if daily then line = clean(line:sub(2)) end
            local stat
            line, stat = take_stat(line)
            local words, goal = line:match("^(.-)%s*|%s*(.-)$")
            local q = { text = words or line, kind = "task", daily = daily, stat = stat or cur.stat }
            if goal then
                local lower = goal:lower()
                if lower:sub(1, 4) == "debt" then
                    q.kind, q.debt = "debt", clean(lower:sub(5):gsub("^:", ""))
                else
                    local n = tonumber((goal:gsub("[^%d]", "")))
                    if n and n > 0 then q.kind, q.target = "money", n end
                end
            end
            if daily then q.kind, q.target, q.debt = "task", nil, nil end
            if q.text == "" then q.text = "?" end
            q.key = (cur.name .. "/" .. q.text):lower():gsub("|", "/")
            cur.items[#cur.items + 1] = q
        end
    end
end

-- debts from FINANCE (/YOLK/finance/data.txt, written by the Mac on plug-in)
local debts = { total = nil, each = {} }
local function load_debts()
    local s = read_file("/YOLK/finance/data.txt")
    if not s then return end
    for line in (s .. "\n"):gmatch("(.-)\n") do
        local v = line:match("^debt=(%-?%d+)")
        if v then debts.total = tonumber(v) end
        local name, bal = line:match("^D|(.-)|(%-?%d+)")
        if name then debts.each[#debts.each + 1] = { name = name:lower(), bal = tonumber(bal) } end
    end
end
local function debt_now(q)
    if q.debt == "" then return debts.total end
    for _, d in ipairs(debts.each) do
        if d.name:find(q.debt, 1, true) then return d.bal end
    end
    if debts.total then return 0 end    -- FINANCE has numbers but not this debt: it's gone
end

---------------------------------------------------------------- saved progress
local S = { done = {}, got = {}, amt = {}, start = {}, clear = {}, loot = {}, pk = 0,
            day = {}, dg = {}, xp = { 0, 0, 0, 0, 0, 0 } }   -- day: daily done on; dg: daily loot given on

local function load_state()
    local s = read_file(DIR .. "state.txt")
    if not s then return end
    for line in (s .. "\n"):gmatch("(.-)\n") do
        local p = {}
        for part in (line .. "|"):gmatch("(.-)|") do p[#p + 1] = part end
        local k = p[1]
        if k == "done" then S.done[p[2]] = true
        elseif k == "got" then S.got[p[2]] = tonumber(p[3]) or 0
        elseif k == "amt" then S.amt[p[2]] = tonumber(p[3]) or 0
        elseif k == "start" then S.start[p[2]] = tonumber(p[3]) or 0
        elseif k == "clear" then S.clear[p[2]] = true
        elseif k == "loot" then S.loot[#S.loot + 1] = { r = tonumber(p[2]) or 1, power = tonumber(p[3]) or 1, name = p[4] or "?" }
        elseif k == "day" then S.day[p[2]] = tonumber(p[3])
        elseif k == "dg" then S.dg[p[2]] = tonumber(p[3])
        elseif k == "xp" then local i = tonumber(p[2]); if i and S.xp[i] then S.xp[i] = tonumber(p[3]) or 0 end
        elseif k == "pk" then S.pk = tonumber(p[2]) or 0 end
    end
end

local function save_state()
    local f = io.open(DIR .. "state.txt", "w")
    if not f then return end
    f:write("pk|" .. S.pk .. "\n")
    for k in pairs(S.done) do f:write("done|" .. k .. "\n") end
    for k, v in pairs(S.got) do f:write("got|" .. k .. "|" .. v .. "\n") end
    for k, v in pairs(S.amt) do f:write("amt|" .. k .. "|" .. v .. "\n") end
    for k, v in pairs(S.start) do f:write("start|" .. k .. "|" .. v .. "\n") end
    for k in pairs(S.clear) do f:write("clear|" .. k .. "\n") end
    for k, v in pairs(S.day) do f:write("day|" .. k .. "|" .. v .. "\n") end
    for k, v in pairs(S.dg) do f:write("dg|" .. k .. "|" .. v .. "\n") end
    for i, v in ipairs(S.xp) do f:write("xp|" .. i .. "|" .. v .. "\n") end
    for _, l in ipairs(S.loot) do f:write("loot|" .. l.r .. "|" .. l.power .. "|" .. l.name .. "\n") end
    f:close()
end
YOLK_ON_USB = save_state

local function power()
    local p = 100
    for _, l in ipairs(S.loot) do p = p + l.power end
    return p
end

-- SHELL's day number (its clock is local time); dailies reset when it changes
local function today() return math.floor((os.time and os.time() or 0) / 86400) end
local function stat_level(xp) return math.floor(xp / 5) + 1 end   -- a level every 5 quests

-- how far a quest is, in tenths (0..10), plus a line about it
local function progress(q)
    if q.daily then return S.day[q.key] == today() and 10 or 0 end
    if q.kind == "task" then return S.done[q.key] and 10 or 0 end
    if q.kind == "money" then
        local t = math.floor((S.amt[q.key] or 0) * 10 / q.target)
        return t > 10 and 10 or t, money(S.amt[q.key] or 0) .. " of " .. money(q.target)
    end
    local now = debt_now(q)
    if not now then return 0, "waiting for FINANCE numbers" end
    local start = S.start[q.key] or 0
    if now > start then start = now; S.start[q.key] = now end
    if now <= 0 then return 10, "paid off!" end
    local t = math.floor((start - now) * 10 / start)
    return t, money(now) .. " left . " .. math.floor((start - now) * 100 / start) .. "% gone"
end

---------------------------------------------------------------- loot
local function roll(min_r)
    local total = 0
    for i = min_r, 5 do total = total + RARITY[i].weight end
    local x, r = math.random(1, total), min_r
    while x > RARITY[r].weight do x = x - RARITY[r].weight; r = r + 1 end
    local name
    if r == 5 then
        name = EXOTICS[math.random(1, #EXOTICS)][1]
    else
        local pre = PREFIX[r]
        name = pre[math.random(1, #pre)] .. " " .. GEAR[math.random(1, #GEAR)]
    end
    local item = { r = r, name = name, power = RARITY[r].power + math.random(0, 2) }
    S.loot[#S.loot + 1] = item
    return item
end

-- gives out everything earned since last time; returns the events to show
local function collect()
    local events = {}
    local function package(why, stat)
        S.pk = S.pk + 1
        events[#events + 1] = { kind = "drop", item = roll(1), why = why }
        if stat then
            S.xp[stat] = S.xp[stat] + 1
            if S.xp[stat] % 5 == 0 then events[#events + 1] = { kind = "level", stat = stat } end
        end
        if S.pk % 10 == 0 then
            events[#events + 1] = { kind = "rank" }
            events[#events + 1] = { kind = "drop", item = roll(5), why = "rank up: " .. rank_name(S.pk) }
        end
    end
    for _, list in ipairs(lists) do
        local all, any = true, false   -- dailies never "clear"
        for _, q in ipairs(list.items) do
            local t = progress(q)
            if q.daily then
                if t >= 10 and S.dg[q.key] ~= today() then S.dg[q.key] = today(); package(q.text, q.stat) end
            else
                any = true
                if t < 10 then all = false end
                local got = S.got[q.key] or 0
                local earn = (q.kind == "task") and (t >= 10 and 1 or 0) or t
                for _ = got + 1, earn do
                    package(q.kind == "task" and q.text or (q.text .. " " .. (got + 1) * 10 .. "%"), q.stat)
                    got = got + 1
                end
                S.got[q.key] = got
            end
        end
        local ck = list.name:lower()
        if all and any and not S.clear[ck] then
            S.clear[ck] = true
            events[#events + 1] = { kind = "clear", list = list.name }
            events[#events + 1] = { kind = "drop", item = roll(4), why = list.name .. " cleared" }
        end
    end
    save_state()
    return events
end

---------------------------------------------------------------- reveal screens
local function show_item(item, why)
    local R = RARITY[item.r]
    rect(C.bg, 0, 0, W, H)
    diamond(W / 2, 52, 30, R.color)
    diamond(W / 2, 52, 20, R.dark)
    diamond(W / 2, 52, 8, R.color)
    text(R.color, R.name, W / 2, 96, "center")
    text(C.white, fit(item.name, 38), W / 2, 118, "center")
    text(C.dim, "+" .. item.power .. " power", W / 2, 140, "center")
    local f = flavor(item.name)
    if f and item.r == 5 then text(R.color, '"' .. f .. '"', W / 2, 166, "center") end
    if why then text(C.dim, fit("for: " .. why, 38), W / 2, H - CH * 2 - 10, "center") end
    text(C.dim, "select: nice", W / 2, H - CH - 6, "center")
    rb.lcd_update()
    wait_button()
end

local function open_engram(item, why)
    local R = RARITY[item.r]
    local pulse = { 0, 2, 4, 6, 4, 2 }
    rb.get_plugin_action(HZ / 10)
    for frame = 1, 30 do
        rect(C.bg, 0, 0, W, H)
        local r = 34 + pulse[frame % 6 + 1] + frame / 3
        for _ = 1, frame / 3 do   -- sparks
            rect(R.color, W / 2 + math.random(-90, 90), 100 + math.random(-60, 60), 3, 3)
        end
        diamond(W / 2, 100, r, R.color)
        diamond(W / 2, 100, r - 8, R.dark)
        diamond(W / 2, 100, (r - 8) * frame / 30, R.color)
        text(C.dim, "decrypting...", W / 2, H - CH - 10, "center")
        rb.lcd_update()
        if is_button(rb.get_plugin_action(HZ / 25)) then break end
    end
    rect(C.white, 0, 0, W, H); rb.lcd_update(); rb.sleep(HZ / 20)
    show_item(item, why)
end

local function play(events)
    for _, e in ipairs(events) do
        if e.kind == "drop" then
            open_engram(e.item, e.why)
        else
            rect(C.bg, 0, 0, W, H)
            draw_face(e.kind == "rank" and "love" or "great", W / 2, 56)
            if e.kind == "level" then
                text(C.yolk, STATS[e.stat] .. " LEVEL UP", W / 2, 104, "center")
                text(C.white, "now level " .. stat_level(S.xp[e.stat]), W / 2, 128, "center")
                text(C.dim, "look at you, growing.", W / 2, 152, "center")
            elseif e.kind == "rank" then
                text(C.yolk, S.pk .. " QUESTS DONE!", W / 2, 104, "center")
                text(C.white, "RANK UP: " .. rank_name(S.pk), W / 2, 128, "center")
                text(C.dim, "a reward waits. it is shiny.", W / 2, 152, "center")
            else
                text(C.yolk, "LIST CLEARED", W / 2, 104, "center")
                text(C.white, e.list, W / 2, 128, "center")
                text(C.dim, "every box. checked. i'm proud.", W / 2, 152, "center")
            end
            text(C.dim, e.kind == "level" and "select: nice" or "select: open it", W / 2, H - CH - 6, "center")
            rb.lcd_update()
            wait_button()
        end
    end
end

---------------------------------------------------------------- scrolling menu
-- rows: { left, right, color, sub, bar (tenths) }. Returns the picked index or nil.
local TOP = 62
local function row_h(r) return (r.sub or r.bar) and CH * 2 + 8 or CH + 8 end

local function menu(header, rows, sel)
    local first = 1
    rb.get_plugin_action(HZ / 5)
    while true do
        if sel < first then first = sel end
        while true do   -- scroll down until the picked row fits
            local y = TOP
            for i = first, sel do y = y + row_h(rows[i]) end
            if y <= H or first >= sel then break end
            first = first + 1
        end
        rect(C.bg, 0, 0, W, H)
        header()
        local y, i, cols = TOP, first, math.floor((W - 20) / CW)
        while rows[i] and y + row_h(rows[i]) <= H do
            local r, h = rows[i], row_h(rows[i])
            if i == sel then rect(C.panel, 0, y, W, h - 2); rect(C.yolk, 0, y, 3, h - 2) end
            local right = r.right or ""
            text(r.color or C.text, fit(r.left, cols - #right - 1), 10, y + 4)
            text(i == sel and C.yolk or C.dim, right, W - 10, y + 4, "right")
            if r.bar then
                bar(10, y + CH + 9, 90, 6, r.bar, r.bar >= 10 and C.green or C.yolk)
                if r.sub then text(C.dim, fit(r.sub, cols - 13), 108, y + CH + 4) end
            elseif r.sub then
                text(C.dim, fit(r.sub, cols), 10, y + CH + 4)
            end
            y, i = y + h, i + 1
        end
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then
            if sel < #rows then sel = sel + 1 end
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then
            if sel > 1 then sel = sel - 1 end
        elseif a == A.PLA_SELECT_REL or a == A.PLA_RIGHT then return sel
        elseif a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then return nil end
    end
end

local function main_header()
    rect(C.panel, 0, 0, W, TOP - 4)
    rect(C.yolk, 0, TOP - 4, W, 1)
    text(C.yolk, "QUEST LOG", 10, 6)
    text(C.text, rank_name(S.pk), 10, 26)
    text(C.dim, "POWER", W - 10, 6, "right")
    text(RARITY[5].color, tostring(power()), W - 10, 26, "right")
    -- the ten "packages" toward the next reward
    local got = S.pk % 10
    for i = 1, 10 do diamond(W / 2 - 54 + (i - 1) * 12, 47, 4, i <= got and C.yolk or C.dim) end
end

---------------------------------------------------------------- screens
local function confirm(title, line1, line2)
    rect(C.bg, 0, 0, W, H)
    text(C.yolk, title, W / 2, 70, "center")
    text(C.white, fit(line1, 38), W / 2, 100, "center")
    if line2 then text(C.dim, line2, W / 2, 124, "center") end
    text(C.dim, "select: yes      menu: no", W / 2, 180, "center")
    rb.lcd_update()
    local a = wait_button()
    return a == A.PLA_SELECT_REL or a == A.PLA_RIGHT
end

local STEPS = { 1, 10, 100, 1000 }
local function edit_money(q)
    local amt, step = S.amt[q.key] or 0, 2
    rb.get_plugin_action(HZ / 5)
    while true do
        rect(C.bg, 0, 0, W, H)
        text(C.yolk, fit(q.text, 38), W / 2, 30, "center")
        text(C.white, money(amt), W / 2, 80, "center")
        text(C.dim, "of " .. money(q.target), W / 2, 102, "center")
        local t = math.floor(amt * 10 / q.target)
        bar(40, 130, W - 80, 10, t > 10 and 10 or t, t >= 10 and C.green or C.yolk)
        text(C.text, "spin: +/- " .. money(STEPS[step]), W / 2, 160, "center")
        text(C.dim, "<< >> step   select: save", W / 2, 184, "center")
        text(C.dim, "menu: cancel", W / 2, 204, "center")
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then amt = amt + STEPS[step]
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then
            amt = amt - STEPS[step]; if amt < 0 then amt = 0 end
        elseif a == A.PLA_RIGHT then if step < #STEPS then step = step + 1 end
        elseif a == A.PLA_LEFT then if step > 1 then step = step - 1 end
        elseif a == A.PLA_SELECT_REL then S.amt[q.key] = amt; return true
        elseif a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then return false end
    end
end

local function list_screen(list)
    local sel = 1
    while true do
        local rows, done = {}, 0
        for _, q in ipairs(list.items) do
            local t, sub = progress(q)
            if t >= 10 then done = done + 1 end
            if q.kind == "task" then
                rows[#rows + 1] = { left = (t >= 10 and "[x] " or "[ ] ") .. q.text, color = t >= 10 and C.dim or C.text,
                                    right = (q.daily and t >= 10) and "today" or nil }
            else
                rows[#rows + 1] = { left = q.text, right = t * 10 .. "%", bar = t, sub = sub,
                                    color = t >= 10 and C.green or C.text }
            end
        end
        local function header()
            main_header()
            rect(C.panel, 0, 0, W, TOP - 4)
            text(C.yolk, list.name, 10, 6)
            text(C.dim, done .. " of " .. #list.items .. " done", 10, 26)
            text(C.dim, S.clear[list.name:lower()] and "CLEARED" or "", W - 10, 26, "right")
            rect(C.yolk, 0, TOP - 4, W, 1)
        end
        if #rows == 0 then rows[1] = { left = "(empty list)", color = C.dim } end
        local pick = menu(header, rows, sel)
        if not pick then return end
        sel = pick
        local q = list.items[pick]
        if q and q.daily then
            if S.day[q.key] ~= today() then
                if confirm("DONE TODAY?", q.text, "no streaks. no guilt. just loot.") then
                    S.day[q.key] = today(); play(collect())
                end
            elseif confirm("UNCHECK IT?", q.text, "back tomorrow either way") then
                S.day[q.key] = nil; save_state()
            end
        elseif q and q.kind == "task" then
            if not S.done[q.key] then
                if confirm("QUEST DONE?", q.text, nil) then S.done[q.key] = true; play(collect()) end
            elseif confirm("UNCHECK IT?", q.text, "your loot stays yours") then
                S.done[q.key] = nil; save_state()
            end
        elseif q and q.kind == "money" then
            if edit_money(q) then play(collect()) end
        elseif q then
            local _, sub = progress(q)
            confirm("FROM FINANCE", sub, "updates when SHELL plugs in")
        end
    end
end

local function vault()
    if #S.loot == 0 then
        confirm("VAULT", "empty. go do a quest.", nil)
        return
    end
    local rows, count = {}, { 0, 0, 0, 0, 0 }
    for i = #S.loot, 1, -1 do
        local l = S.loot[i]
        count[l.r] = count[l.r] + 1
        rows[#rows + 1] = { left = l.name, right = "+" .. l.power, color = RARITY[l.r].color, item = l }
    end
    local function header()
        rect(C.panel, 0, 0, W, TOP - 4)
        rect(C.yolk, 0, TOP - 4, W, 1)
        text(C.yolk, "VAULT", 10, 6)
        text(C.dim, #S.loot .. " things", W - 10, 6, "right")
        local x = 10
        for r = 1, 5 do
            local s = count[r] .. " " .. RARITY[r].name:sub(1, 3)
            text(RARITY[r].color, s, x, 28)
            x = x + rb.font_getstringsize(s, UI) + 10
        end
    end
    local sel = 1
    while true do
        sel = menu(header, rows, sel)
        if not sel then return end
        show_item(rows[sel].item)
    end
end

-- WHAT NOW?: one open quest, picked for you. Dailies and plain quests only.
local NO_HURRY = { "no hurry. one thing is enough.", "small steps still count.",
    "resting is allowed. i checked.", "you don't have to do it all today.", "finish one. that's the trick." }
local function what_now()
    local open = {}
    for _, list in ipairs(lists) do
        for _, q in ipairs(list.items) do
            if q.kind == "task" and progress(q) < 10 then open[#open + 1] = { q = q, list = list.name } end
        end
    end
    local line = NO_HURRY[math.random(1, #NO_HURRY)]
    while true do
        rect(C.bg, 0, 0, W, H)
        if #open == 0 then
            draw_face("love", W / 2, 60)
            text(C.yolk, "nothing open.", W / 2, 110, "center")
            text(C.text, "rest. you earned it.", W / 2, 134, "center")
            rb.lcd_update(); wait_button(); return
        end
        local pick = open[math.random(1, #open)]
        draw_face("good", W / 2, 50)
        text(C.dim, "WHAT NOW? try this:", W / 2, 96, "center")
        text(C.white, fit(pick.q.text, 38), W / 2, 120, "center")
        text(C.dim, "from " .. pick.list .. (pick.q.stat and (" . " .. STATS[pick.q.stat]) or ""), W / 2, 142, "center")
        text(C.yolk, line, W / 2, 168, "center")
        text(C.dim, "select: did it   >>: another", W / 2, H - CH * 2 - 10, "center")
        text(C.dim, "menu: later", W / 2, H - CH - 6, "center")
        rb.lcd_update()
        local a = wait_button()
        if a == A.PLA_SELECT_REL then
            if pick.q.daily then S.day[pick.q.key] = today() else S.done[pick.q.key] = true end
            play(collect()); return
        elseif a ~= A.PLA_RIGHT and a ~= A.PLA_DOWN and a ~= A.PLA_LEFT then return end
    end
end

local function character()
    rect(C.bg, 0, 0, W, H)
    rect(C.panel, 0, 0, W, TOP - 4)
    rect(C.yolk, 0, TOP - 4, W, 1)
    text(C.yolk, "CHARACTER", 10, 6)
    text(C.text, rank_name(S.pk), 10, 26)
    text(C.dim, "POWER", W - 10, 6, "right")
    text(RARITY[5].color, tostring(power()), W - 10, 26, "right")
    for i, name in ipairs(STATS) do
        local y, xp = TOP + 6 + (i - 1) * (CH + 13), S.xp[i]
        text(C.text, name, 10, y)
        text(C.yolk, "LV " .. stat_level(xp), 150, y)
        bar(200, y + 5, W - 210, 7, (xp % 5) * 2)
    end
    rb.lcd_update()
    wait_button()
end

local function main()
    local sel = 1
    while true do
        local rows = { { left = "WHAT NOW?", color = C.yolk, right = "pick one for me" } }
        for _, list in ipairs(lists) do
            local done = 0
            for _, q in ipairs(list.items) do if progress(q) >= 10 then done = done + 1 end end
            local n = #list.items
            rows[#rows + 1] = { left = list.name, right = done .. "/" .. n,
                                bar = n > 0 and math.floor(done * 10 / n) or 0,
                                sub = S.clear[list.name:lower()] and "cleared" or nil }
        end
        rows[#rows + 1] = { left = "CHARACTER", right = "6 stats", color = RARITY[3].color }
        rows[#rows + 1] = { left = "VAULT", right = #S.loot .. " things", color = RARITY[4].color }
        local pick = menu(main_header, rows, sel)
        if not pick then return end
        sel = pick
        if pick == 1 then what_now()
        elseif pick == #lists + 2 then character()
        elseif pick == #lists + 3 then vault()
        else list_screen(lists[pick - 1]) end
    end
end

---------------------------------------------------------------- go
math.randomseed(rb.current_tick() + (os.time and os.time() or 0))
load_lists()
load_debts()
load_state()
play(collect())   -- anything earned while away (FINANCE debt going down)
main()
save_state()
rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
