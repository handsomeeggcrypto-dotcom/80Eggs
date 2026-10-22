--[[ MOETORCYCLES MINI // the Eggs ride on Countryside, for SHELL
     select   jump (tap again to double jump, let go early for a short hop)
     play     dash (smash hay bales)
     menu     pause / quit

     Same floaty feel as the full game, at 1/3 scale for the 320x240 screen.
     Rockbox Lua is integer-only, so positions are kept in 1/16 px (FP). ]]

require "actions"

local A = rb.actions
local W, H, HZ = rb.LCD_WIDTH, rb.LCD_HEIGHT, rb.HZ
local DIR = "/YOLK/moto/"
local UI = rb.FONT_UI
local FP = 16

-- physics: the full game's numbers divided by 3 (px, px/s, px/s^2)
local GRAVITY   = 333 * FP
local JUMP_V    = -240 * FP
local MAX_FALL  = 383 * FP
local SPEED_START, SPEED_MAX, SPEED_RAMP = 160, 267, 2   -- px/s, ramp per second
local DASH_TICKS, DASH_CD = 42 * HZ / 100, 90 * HZ / 100
local BOOST_TICKS, BOOST_LIFT = 85 * HZ / 100, -107 * FP
local MAX_JUMPS = 2
local PX = 83             -- player's screen x (26% across, like the full game)
local GROUND = 200        -- default road surface
local LAND_TOL = 13       -- you can drop onto a surface up to this far below your feet

local C = {
    sky = rb.lcd_rgbpack(120, 170, 220),
    grass = rb.lcd_rgbpack(92, 125, 51), dirt_top = rb.lcd_rgbpack(165, 121, 63),
    dirt = rb.lcd_rgbpack(138, 98, 52), dirt_dark = rb.lcd_rgbpack(106, 74, 38),
    lip = rb.lcd_rgbpack(74, 51, 27),
    yolk = rb.lcd_rgbpack(255, 194, 26), white = rb.lcd_rgbpack(255, 255, 255),
    ink = rb.lcd_rgbpack(20, 14, 6), dash = rb.lcd_rgbpack(91, 200, 255),
    shade = rb.lcd_rgbpack(10, 8, 6),
}

---------------------------------------------------------------- art
local function bmp(name, transparent)
    return rb.read_bmp_file(DIR .. name .. ".bmp", false, transparent)
end
local back = bmp("back", false)
local front = bmp("front", true)
local ride = {}
for _, p in ipairs({ "ride", "wheelie", "air", "land", "crash" }) do ride[p] = bmp("ride_" .. p, true) end
local hay = { [22] = bmp("hay22", true), [26] = bmp("hay26", true), [30] = bmp("hay30", true) }
local star_img, ring_img, title = bmp("star", true), bmp("ring", true), bmp("title", true)
local yolk = {}
for _, m in ipairs({ "great", "good", "ok", "sus", "shock", "love", "dying" }) do yolk[m] = bmp("yolk_" .. m, true) end

local BACK_W = back and back:width() or W
local FRONT_W = front and front:width() or W

---------------------------------------------------------------- helpers
local function rect(c, x, y, w, h) rb.lcd_set_foreground(c); rb.lcd_fillrect(x, y, w, h) end
local function text(c, s, x, y)
    rb.lcd_setfont(UI); rb.lcd_set_drawmode(2); rb.lcd_set_foreground(c); rb.lcd_putsxy(x, y, s)
end
local function text_w(s) return (rb.font_getstringsize(s, UI)) end
local function center(c, s, y) text(c, s, (W - text_w(s)) / 2, y) end
local function shadow_text(c, s, x, y) text(C.shade, s, x + 1, y + 1); text(c, s, x, y) end
local function blit(img, x, y) if img then rb.lcd_bitmap_transparent(img, x, y, img:width(), img:height()) end end
local function rnd(a, b) return math.random(a, b) end

-- horizontally tiled scrolling layer
local function scroll_layer(img, imgw, off, transparent)
    if not img then return end
    off = off % imgw
    local first = imgw - off
    if first > W then first = W end
    local f = transparent and rb.lcd_bitmap_transparent_part or rb.lcd_bitmap_part
    f(img, off, 0, imgw, 0, 0, first, H)
    if first < W then f(img, 0, 0, imgw, first, 0, W - first, H) end
end

local function load_best()
    local f = io.open(DIR .. "best.txt", "r")
    local b = f and tonumber(f:read("*l")) or 0
    if f then f:close() end
    return b
end
local function save_best(b)
    local f = io.open(DIR .. "best.txt", "w")
    if f then f:write(b .. "\n"); f:close() end
end

---------------------------------------------------------------- YOLK says things
local quip, quip_face, quip_until = nil, "good", 0
local function say(s, face)
    quip, quip_face, quip_until = s, face or "good", rb.current_tick() + HZ * 2
end
local function pick(t) return t[rnd(1, #t)] end

---------------------------------------------------------------- world
local p, segs, stars, rings, hazards
local dist, speed, last_top, next_x, score, got_stars, best

local function new_run()
    p = { y = (GROUND - 50) * FP, vy = 0, ground = true, jumps = 0, dash = 0, dash_cd = 0,
          boost = 0, land = 0, alive = true, dead_t = 0 }
    segs, stars, rings, hazards = {}, {}, {}, {}
    dist, speed, last_top, next_x, score, got_stars = 0, SPEED_START * FP, GROUND, 0, 0, 0
    -- a long safe runway to start on
    segs[1] = { x = -40, w = 360, top = GROUND }
    next_x = 320
end

local function generate()
    while next_x < dist / FP + W * 2 do
        local prev_top = last_top
        local gap = rnd(1, 100) <= 40 and rnd(67, 153) or 0
        local gap_start = next_x
        next_x = next_x + gap
        local w = rnd(87, 207)
        local top = last_top + rnd(-40, 40)
        if top < GROUND - 77 then top = GROUND - 77 elseif top > GROUND + 20 then top = GROUND + 20 end
        local seg = { x = next_x, w = w, top = top }
        segs[#segs + 1] = seg
        last_top = top
        -- gold boost rings arc over wide gaps
        if gap > 40 then
            local n = gap > 113 and 2 or 1
            local base = prev_top < top and prev_top or top
            local peak = rnd(40, 70)
            for i = 1, n do
                local lift = n == 1 and peak or peak * 87 / 100
                rings[#rings + 1] = { x = gap_start + gap * i / (n + 1), y = base - 27 - lift, got = false }
            end
        end
        -- stars in an arc over the road
        if rnd(1, 10) <= 8 then
            local n, arc = rnd(3, 6), rnd(13, 50)
            for i = 1, n do
                local t100 = i * 100 / (n + 1)                    -- 0..100
                local hump = 4 * t100 * (100 - t100) / 100       -- parabola, 0..100
                stars[#stars + 1] = { x = seg.x + w * i / (n + 1), y = top - 20 - arc * hump / 100, got = false }
            end
        end
        -- hay bale: jump over or dash through
        if gap == 0 and w > 113 and rnd(1, 2) == 1 then
            local h = ({ 22, 26, 30 })[rnd(1, 3)]
            hazards[#hazards + 1] = { x = seg.x + w * rnd(35, 70) / 100, top = top, h = h, w = 26, dead = false }
        end
        next_x = next_x + w
    end
    -- forget things that scrolled away
    local cut = dist / FP - 80
    while segs[1] and segs[1].x + segs[1].w < cut do table.remove(segs, 1) end
    while stars[1] and stars[1].x < cut do table.remove(stars, 1) end
    while rings[1] and rings[1].x < cut do table.remove(rings, 1) end
    while hazards[1] and hazards[1].x < cut do table.remove(hazards, 1) end
end

-- road surface under world x, or nil over a gap
local function surface(wx)
    for _, s in ipairs(segs) do
        if wx >= s.x and wx < s.x + s.w then return s.top end
    end
    return nil
end

---------------------------------------------------------------- update
local function jump()
    if not p.alive then return end
    if p.ground or p.jumps < MAX_JUMPS then
        if p.ground then p.jumps = 1 else p.jumps = p.jumps + 1 end
        p.vy = JUMP_V
        p.ground = false
    end
end

local function dash()
    if p.alive and p.dash == 0 and p.dash_cd == 0 then
        p.dash, p.dash_cd = DASH_TICKS, DASH_CD
    end
end

local function crash(why)
    if not p.alive then return end
    p.alive = false
    p.vy = -100 * FP
    say(why or pick({ "rip.", "i felt that.", "that hay came out of nowhere.", "the eggs are fine. probably." }), "shock")
end

local function update(dt)  -- dt in ticks
    if p.dash > 0 then p.dash = math.max(0, p.dash - dt) end
    if p.dash_cd > 0 then p.dash_cd = math.max(0, p.dash_cd - dt) end
    if p.boost > 0 then p.boost = math.max(0, p.boost - dt) end
    if p.land > 0 then p.land = math.max(0, p.land - dt) end

    if p.alive then
        if speed < SPEED_MAX * FP then speed = speed + SPEED_RAMP * FP * dt / HZ end
        local v = speed
        if p.boost > 0 then v = v * 2 elseif p.dash > 0 then v = v * 16 / 10 end
        dist = dist + v * dt / HZ
        score = dist / FP / 30 + got_stars * 10
    end

    -- gravity
    local old_feet = p.y / FP + 50
    p.vy = p.vy + GRAVITY * dt / HZ
    if p.vy > MAX_FALL then p.vy = MAX_FALL end
    p.y = p.y + p.vy * dt / HZ
    local feet = p.y / FP + 50
    local wx = dist / FP + PX

    if p.alive then
        local top = surface(wx)
        if top and p.vy >= 0 and old_feet <= top + LAND_TOL and feet >= top then
            if not p.ground then p.land = 12 * HZ / 100 end
            p.y = (top - 50) * FP; p.vy = 0; p.ground = true; p.jumps = 0
        elseif not top or feet < top - 1 then
            p.ground = false
        end
        if feet > H + 20 then crash("down the hole. bye.") end

        -- hay bales
        for _, hz in ipairs(hazards) do
            if not hz.dead and wx + 18 > hz.x and wx - 14 < hz.x + hz.w and feet > hz.top - hz.h + 4 then
                if p.dash > 0 or p.boost > 0 then
                    hz.dead = true; score = score + 25
                    say(pick({ "BONK.", "hay everywhere.", "smash." }), "great")
                else
                    crash()
                end
            end
        end
        -- stars and rings
        local cy = feet - 30
        for _, s in ipairs(stars) do
            if not s.got and math.abs(s.x - wx) < 16 and math.abs(s.y - cy) < 26 then
                s.got = true; got_stars = got_stars + 1
                if got_stars % 25 == 0 then say("shiny. " .. got_stars .. " stars.", "love") end
            end
        end
        for _, r in ipairs(rings) do
            if not r.got and math.abs(r.x - wx) < 18 and math.abs(r.y - cy) < 24 then
                r.got = true; p.boost = BOOST_TICKS; p.vy = BOOST_LIFT; p.ground = false
                got_stars = got_stars + 5
                say(pick({ "WHEEE.", "boost!", "egg in flight." }), "great")
            end
        end
    else
        p.dead_t = p.dead_t + dt
    end
end

---------------------------------------------------------------- draw
local function draw_road(s, sx)
    local top = s.top
    local bot = top + 44
    if bot > H - 27 then bot = H end
    rect(C.dirt, sx, top, s.w, bot - top)
    rect(C.dirt_top, sx, top, s.w, 3)
    rect(C.grass, sx, top - 1, s.w, 2)
    -- ruts scroll with the road
    rect(C.dirt_dark, sx, top + 9, s.w, 1)
    rect(C.dirt_dark, sx, top + 17, s.w, 1)
    if bot < H then rect(C.lip, sx, bot - 2, s.w, 2) end
end

local function draw_world()
    local d = dist / FP
    scroll_layer(back, BACK_W, d / 10, false)
    scroll_layer(front, FRONT_W, d * 6 / 10, true)
    for _, s in ipairs(segs) do
        local sx = s.x - d
        if sx < W and sx + s.w > 0 then draw_road(s, sx) end
    end
    for _, r in ipairs(rings) do
        if not r.got then blit(ring_img, r.x - d - 20 + PX, r.y - 20) end
    end
    for _, s in ipairs(stars) do
        if not s.got then blit(star_img, s.x - d - 5 + PX, s.y - 5) end
    end
    for _, hz in ipairs(hazards) do
        if not hz.dead then blit(hay[hz.h], hz.x - d + PX, hz.top - hz.h) end
    end
end

local bob_t = 0
local function draw_player()
    local img
    if not p.alive then img = ride.crash
    elseif not p.ground then img = p.vy < 0 and ride.wheelie or ride.air
    elseif p.land > 0 then img = ride.land
    else img = ride.ride end
    if not img then return end
    local bob = (p.alive and p.ground and (bob_t / 6) % 2 == 0) and 1 or 0
    local x = PX - img:width() / 2
    local y = p.y / FP + 50 - img:height() + 1 + bob
    if p.dash > 0 or p.boost > 0 then
        -- speed lines behind the bike
        local c = p.boost > 0 and C.yolk or C.dash
        for i = 0, 4 do rect(c, x - 30 + (bob_t * 7 + i * 13) % 24, y + 20 + i * 9, 20, 2) end
    end
    blit(img, x, y)
end

local function draw_hud()
    -- top strip over the sky: score, dash meter, stars; the road stays clear
    rect(C.shade, 0, 0, W, 24)
    text(C.white, tostring(score), 6, 4)
    local ready = p.dash_cd == 0
    rect(C.dirt_dark, 60, 9, 42, 6)
    rect(ready and C.dash or C.lip, 61, 10, ready and 40 or 40 - 40 * p.dash_cd / DASH_CD, 4)
    blit(star_img, W - 52, 6)
    text(C.yolk, tostring(got_stars), W - 38, 4)
    -- YOLK's commentary, just under the strip
    if quip and rb.current_tick() < quip_until then
        local w = text_w(quip) + 36
        rect(C.shade, (W - w) / 2, 26, w, 26)
        blit(yolk[quip_face] or yolk.good, (W - w) / 2 + 2, 27)
        text(C.yolk, quip, (W - w) / 2 + 30, 31)
    end
end

---------------------------------------------------------------- screens
local function pressed(a) return a ~= A.ACTION_NONE and a ~= A.ACTION_UNKNOWN and a ~= nil and a >= 0 end

local function wait_choice()
    rb.get_plugin_action(HZ / 4)
    while true do
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SELECT_REL or a == A.PLA_SELECT or a == A.PLA_DOWN then return true end
        if a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then return false end
    end
end

local function title_screen()
    rb.get_plugin_action(HZ / 4)
    local t = 0
    while true do
        scroll_layer(back, BACK_W, t / 4, false)
        scroll_layer(front, FRONT_W, t, true)
        rect(C.dirt, 0, GROUND, W, H - GROUND); rect(C.dirt_top, 0, GROUND, W, 3); rect(C.grass, 0, GROUND - 1, W, 2)
        if title then blit(title, (W - title:width()) / 2, 18) end
        center(C.white, "MINI . for SHELL", 56)
        local img = ride.ride
        if img then blit(img, PX - img:width() / 2, GROUND - img:height() + 1 + ((t / 6) % 2)) end
        shadow_text(C.yolk, "o  ride", 186, 120)
        shadow_text(C.white, "menu  quit", 186, 140)
        shadow_text(C.white, "best " .. best, 186, 166)
        rect(C.shade, 0, H - 28, W, 28)
        blit(yolk.good, 4, H - 26)
        text(C.yolk, "o jump . > dash . hold on.", 34, H - 22)
        rb.lcd_update()
        t = t + 2
        local a = rb.get_plugin_action(HZ / 25)
        if a == A.PLA_SELECT_REL or a == A.PLA_DOWN then return true end
        if a == A.PLA_UP or a == A.PLA_CANCEL or a == A.PLA_EXIT then return false end
    end
end

local function pause_screen()
    rect(C.shade, 60, 80, 200, 70)
    center(C.yolk, "PAUSED", 90)
    center(C.white, "o resume . menu quit", 118)
    rb.lcd_update()
    return wait_choice()
end

local function game_over()
    local new_best = score > best
    if new_best then best = score; save_best(best) end
    rect(C.shade, 40, 60, 240, 100)
    center(C.yolk, "CRASHED", 70)
    center(C.white, "score " .. score .. "   stars " .. got_stars, 94)
    center(new_best and C.yolk or C.white, new_best and "NEW BEST!" or ("best " .. best), 114)
    center(C.white, "o again . menu quit", 138)
    if new_best then say("NEW BEST. i'm telling everyone.", "love") end
    draw_hud()
    rb.lcd_update()
    return wait_choice()
end

---------------------------------------------------------------- main loop
local function run()
    new_run()
    say(pick({ "let's ride.", "helmet on. oh wait.", "go go go." }), "great")
    local last = rb.current_tick()
    while true do
        local now = rb.current_tick()
        local dt = now - last
        if dt < 1 then dt = 1 elseif dt > 6 then dt = 6 end
        last = now
        bob_t = bob_t + dt

        -- handle every button press since last frame
        for _ = 1, 4 do
            local a = rb.get_plugin_action(0)
            if not pressed(a) then break end
            if a == A.PLA_SELECT then jump()
            elseif a == A.PLA_SELECT_REL then
                if p.vy < 0 and p.alive then p.vy = p.vy * 55 / 100 end   -- short hop
            elseif a == A.PLA_DOWN then dash()
            elseif a == A.PLA_UP then
                if not pause_screen() then return false end
                last = rb.current_tick()
            end
        end

        generate()
        update(dt)
        draw_world()
        draw_player()
        draw_hud()
        rb.lcd_update()

        if not p.alive and p.dead_t > HZ then return game_over() end
        -- ~30 frames a second
        local spare = 3 - (rb.current_tick() - now)
        if spare > 0 then rb.sleep(spare) end
    end
end

math.randomseed(rb.current_tick() + (os.time and os.time() or 0))
best = load_best()
if title_screen() then
    while run() do end
end
rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
