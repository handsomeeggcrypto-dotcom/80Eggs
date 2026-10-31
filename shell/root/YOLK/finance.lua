--[[ FINANCE // your Finance Tracker, read-only, on SHELL
     spin     scroll      menu     leave

     The Mac writes /YOLK/finance/data.txt when SHELL plugs in (yolk/finance.py).
     The wheel code stops casual snooping only: the numbers are plain text on the card. ]]

require "actions"
dofile("/YOLK/usb.lua")  -- close and hand SHELL over when plugged in

local A = rb.actions
local W, H, HZ = rb.LCD_WIDTH, rb.LCD_HEIGHT, rb.HZ
local UI = rb.FONT_UI
local _, CW, CH = rb.font_getstringsize("M", UI)  -- (width, w, h)

local BG    = rb.lcd_rgbpack(8, 8, 0)
local PANEL = rb.lcd_rgbpack(22, 18, 12)
local YOLK  = rb.lcd_rgbpack(255, 194, 26)
local DIM   = rb.lcd_rgbpack(138, 100, 16)
local TEXT  = rb.lcd_rgbpack(242, 234, 219)
local RED   = rb.lcd_rgbpack(255, 90, 90)
local GREEN = rb.lcd_rgbpack(110, 230, 140)

local function rect(c, x, y, w, h) rb.lcd_set_foreground(c); rb.lcd_fillrect(x, y, w, h) end
local function text(c, s, x, y, align)
    rb.lcd_setfont(UI); rb.lcd_set_drawmode(2); rb.lcd_set_foreground(c)
    local w = rb.font_getstringsize(s, UI)
    if align == "right" then x = x - w elseif align == "center" then x = x - w / 2 end
    rb.lcd_putsxy(x, y, s)
end
local function fit(s, chars) return #s <= chars and s or (s:sub(1, chars - 1) .. "~") end

local function money(n)
    local s, neg = tostring(n < 0 and -n or n), n < 0
    while true do
        local a, b = s:match("^(%d+)(%d%d%d.*)$")
        if not a then break end
        s = a .. "," .. b
    end
    return (neg and "-$" or "$") .. s
end

---------------------------------------------------------------- data
local info, rows = {}, {}
local function load_data()
    local f = io.open("/YOLK/finance/data.txt", "r")
    if not f then return false end
    local debts, assets, income = {}, {}, {}
    for line in f:lines() do
        local k, v = line:match("^(%a+)=(.*)$")
        if k then
            info[k] = v
        else
            local p = {}
            for part in (line .. "|"):gmatch("(.-)|") do p[#p + 1] = part end
            if p[1] == "D" then debts[#debts + 1] = p
            elseif p[1] == "A" then assets[#assets + 1] = p
            elseif p[1] == "I" then income[#income + 1] = p end
        end
    end
    f:close()
    local function head(s) rows[#rows + 1] = { head = s } end
    local function row(l, v, c, sub) rows[#rows + 1] = { left = l, right = v, color = c, sub = sub } end
    local function dollars(k) return money(tonumber(info[k]) or 0) end
    head("THIS MONTH")
    row("income", dollars("income"), GREEN)
    row("minimums", dollars("minimums"), RED)
    row("extra toward debt", dollars("extra"), TEXT)
    if #debts > 0 then
        head("DEBTS  " .. dollars("debt"))
        for _, d in ipairs(debts) do
            row(d[2], money(tonumber(d[3]) or 0), RED,
                "min " .. money(tonumber(d[4]) or 0) .. " . " .. d[5] .. "% . gone " .. d[6])
        end
    end
    if #assets > 0 then
        head("ASSETS  " .. dollars("assets"))
        for _, a in ipairs(assets) do row(a[2], money(tonumber(a[3]) or 0), GREEN) end
    end
    if #income > 0 then
        head("INCOME")
        for _, a in ipairs(income) do row(a[2], money(tonumber(a[3]) or 0), GREEN) end
    end
    if (tonumber(info.interest) or 0) > 0 then
        head("PLAN: " .. (info.plan or ""))
        row("interest left", dollars("interest"), RED)
    end
    return true
end

---------------------------------------------------------------- wheel code
local function unlock(code)
    if not code or #code ~= 4 then return true end
    local digits, pos, wrong = { 0, 0, 0, 0 }, 1, false
    rb.get_plugin_action(HZ / 5)
    while true do
        rect(BG, 0, 0, W, H)
        text(YOLK, "FINANCE", W / 2, 44, "center")
        text(wrong and RED or DIM, wrong and "nope. try again." or "the code, please.", W / 2, 66, "center")
        for i = 1, 4 do
            local x = W / 2 - 62 + (i - 1) * 32
            rect(i == pos and YOLK or PANEL, x, 96, 28, CH + 16)
            text(i == pos and BG or TEXT, tostring(digits[i]), x + 14, 104, "center")
        end
        text(DIM, "spin:digit  o:next  menu:leave", W / 2, 170, "center")
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then digits[pos] = (digits[pos] + 1) % 10
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then digits[pos] = (digits[pos] + 9) % 10
        elseif a == A.PLA_SELECT_REL or a == A.PLA_RIGHT then
            if pos < 4 then pos = pos + 1
            elseif digits[1] .. digits[2] .. digits[3] .. digits[4] == code then return true
            else digits, pos, wrong = { 0, 0, 0, 0 }, 1, true end
        elseif a == A.PLA_LEFT then if pos > 1 then pos = pos - 1 end
        elseif a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then return false end
    end
end

---------------------------------------------------------------- screen
local TOP = 62
local function row_h(r) return r.sub and CH * 2 + 6 or CH + 6 end

local function draw(first)
    rect(BG, 0, 0, W, H)
    rect(PANEL, 0, 0, W, TOP - 4)
    rect(YOLK, 0, TOP - 4, W, 1)
    local nw = tonumber(info.networth) or 0
    text(DIM, "NET WORTH", 10, 6)
    text(nw < 0 and RED or GREEN, money(nw), 10, 26)
    text(DIM, "DEBT FREE", W - 10, 6, "right")
    local free = info.free or "?"
    text(free == "never" and RED or YOLK, free == "none" and "already!" or free, W - 10, 26, "right")
    local y, i, cols = TOP, first, math.floor((W - 20) / CW)
    while rows[i] and y + row_h(rows[i]) <= H do
        local r = rows[i]
        if r.head then
            text(YOLK, r.head, 10, y + 3)
        else
            local amount = r.right
            text(TEXT, fit(r.left, cols - #amount - 1), 10, y + 2)
            text(r.color, amount, W - 12, y + 2, "right")
            if r.sub then text(DIM, fit(r.sub, cols), 10, y + 2 + CH) end
        end
        y = y + row_h(r)
        i = i + 1
    end
    rb.lcd_update()
    return i > #rows        -- the last row is showing
end

local function browse()
    local first, at_end = 1, false
    rb.get_plugin_action(HZ / 5)
    while true do
        at_end = draw(first)
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then
            if not at_end then first = first + 1 end
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then
            if first > 1 then first = first - 1 end
        elseif a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then return end
    end
end

if load_data() then
    if unlock(info.code) then browse() end
else
    rect(BG, 0, 0, W, H)
    text(YOLK, "no numbers yet.", W / 2, 90, "center")
    text(TEXT, "fill in the tracker on the mac,", W / 2, 116, "center")
    text(TEXT, "then plug SHELL in.", W / 2, 136, "center")
    rb.lcd_update()
    rb.get_plugin_action(HZ / 2)
    rb.get_plugin_action(HZ * 6)
end
rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
