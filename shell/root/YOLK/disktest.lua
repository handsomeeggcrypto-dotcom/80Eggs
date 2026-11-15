--[[ DISK TEST // is SHELL's card freezing on saves?
     Saves a small file over and over (like QUEST LOG does on every check-off),
     reads it back, and counts. menu: stop.

     The count is in the file itself (/YOLK/disktest.txt), so if SHELL freezes
     and needs a reset, the Mac can still read how far it got. ]]

require "actions"
dofile("/YOLK/usb.lua")  -- close and hand SHELL over when plugged in

local A = rb.actions
local W, H, HZ = rb.LCD_WIDTH, rb.LCD_HEIGHT, rb.HZ
local UI = rb.FONT_UI
local PATH = "/YOLK/disktest.txt"
local GOAL = 500
local PAD = string.rep("yolk was here. ", 64)   -- about 1KB, the size of the quest save

local function rgb(r, g, b) return rb.lcd_rgbpack(r, g, b) end
local BG, YOLK, TEXT, DIM, RED, GREEN =
    rgb(8, 8, 0), rgb(255, 194, 26), rgb(242, 234, 219), rgb(138, 100, 16), rgb(255, 90, 90), rgb(110, 230, 140)

local function text(c, s, y)
    rb.lcd_setfont(UI); rb.lcd_set_drawmode(2); rb.lcd_set_foreground(c)
    local w = rb.font_getstringsize(s, UI)
    rb.lcd_putsxy(W / 2 - w / 2, y, s)
end

local function screen(n, bad, line, color)
    rb.lcd_set_foreground(BG); rb.lcd_fillrect(0, 0, W, H)
    text(YOLK, "DISK TEST", 20)
    text(TEXT, "saves: " .. n .. " of " .. GOAL, 80)
    text(bad > 0 and RED or DIM, "bad reads: " .. bad, 104)
    text(color or DIM, line, 140)
    text(DIM, "menu: stop", H - 30)
    rb.lcd_update()
end

local function save(n)
    local f = io.open(PATH, "w")
    if not f then return false end
    f:write("n=" .. n .. "\n" .. PAD .. "\n")
    f:close()
    return true
end

local function check(n)
    local f = io.open(PATH, "r")
    if not f then return false end
    local s = f:read("*a")
    f:close()
    return s == "n=" .. n .. "\n" .. PAD .. "\n"
end

local n, bad = 0, 0
local stopped = false
while n < GOAL do
    n = n + 1
    if not save(n) or not check(n) then bad = bad + 1 end
    screen(n, bad, "saving...")
    local a = rb.get_plugin_action(HZ / 20)
    if a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then stopped = true; break end
end

if stopped then
    screen(n, bad, "stopped.", DIM)
elseif bad == 0 then
    screen(n, bad, "all " .. GOAL .. " saves fine!", GREEN)
else
    screen(n, bad, "some saves went wrong.", RED)
end
rb.get_plugin_action(HZ / 5)
while true do
    local a = rb.get_plugin_action(-1)
    if a == A.PLA_SELECT_REL or a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then break end
end
rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
