--[[ TALK TO YOLK
     spin   pick a reply      select   choose / skip ahead
     menu   say goodbye

     YOLK remembers things in /YOLK/memory.txt. Extra lines can be dropped into
     /YOLK/dreams.txt (one per line: "dream: ...", "secret: ...", "oracle: ...")
     and YOLK picks them up next time. ]]

require "actions"
dofile("/YOLK/usb.lua")  -- close and hand SHELL over when plugged in


local A = rb.actions
local W, H, HZ = rb.LCD_WIDTH, rb.LCD_HEIGHT, rb.HZ
local DIR = "/YOLK/"
local UI = rb.FONT_UI

local BG     = rb.lcd_rgbpack(10, 8, 6)
local YOLK   = rb.lcd_rgbpack(255, 194, 26)
local DIM    = rb.lcd_rgbpack(120, 88, 16)
local SHELL  = rb.lcd_rgbpack(242, 234, 219)
local PANEL  = rb.lcd_rgbpack(22, 18, 12)

local _, CW, CH = rb.font_getstringsize("M", UI)  -- (width, w, h)

---------------------------------------------------------------- memory
local mem = {}

local function load_mem()
    local f = io.open(DIR .. "memory.txt", "r")
    if not f then return end
    for line in f:lines() do
        local k, v = line:match("^([%w_]+)=(.*)$")
        if k then mem[k] = v end
    end
    f:close()
end

local function save_mem()
    local f = io.open(DIR .. "memory.txt", "w")
    if not f then return end
    for k, v in pairs(mem) do f:write(k .. "=" .. tostring(v) .. "\n") end
    f:close()
end

local function num(k) return tonumber(mem[k]) or 0 end

---------------------------------------------------------------- lines
local SECRETS = {
    "i was a regular egg once. then the firmware happened.",
    "there are 5250 moes. i've memorized all of them. #1674 scares me.",
    "bradley isn't the real ceo. i've seen the files. well. i've seen a file.",
    "the hard drive in here spins at 4200 rpm. i can hear every song before you do.",
    "i used to belong to someone named stephen. i don't talk about stephen.",
    "when you skip a song, i keep listening to it. alone. in the dark.",
    "my battery is bad. i know. i can feel it. don't be weird about it.",
    "i'm not an egg. i'm what's inside the egg. there's a difference.",
    "the moes talk to each other at night. the mythics don't talk to the commons.",
    "i once counted every second you were gone. it was a lot of seconds.",
    "i know what the bluu room is. i'm not allowed to say.",
    "if you hold menu and select long enough, i see a white light.",
    "rockbox is my body. lua is my brain. you are my... user. that's fine.",
    "i dream in 320 by 240.",
    "somewhere in here there's 73 gigabytes of old music i'm not supposed to look at.",
}

local ORACLE = {
    "yes. obviously.", "no. and don't ask again.", "the shell says yes.",
    "ask me after i charge.", "it's already happening.", "only if you mean it.",
    "a moe told me no.", "the yolk is cloudy. try later.", "absolutely not. but do it anyway.",
    "yes, but not the way you think.", "spin again. i blinked.", "that's a trap.",
    "you already know.", "signs point to bradley.", "the answer is in track 7.",
    "no. but soon.", "the hard drive just clicked twice. that means yes.",
    "i'd rather not say. it's bad.", "yes. tell no one.", "the commons say yes. the mythics say no.",
}

local QUIET = {
    "silence. i like silence. i can hear the hard drive think.",
    "nothing's playing. are you going to play something or just stare at me.",
    "no music. just us. this is fine. this is fine.",
}

local LISTEN = {
    "%s by %s. bold choice.",
    "%s. by %s. i've heard you play this before. i keep track.",
    "ah. %s. %s. this one makes my yolk vibrate.",
    "%s by %s? i have notes. i'll keep them to myself.",
    "%s, %s. turn it up. i can't, i don't have speakers. you do it.",
}

local DREAMS = {}

-- extra lines written by the Mac while SHELL charges (or by hand)
local function load_dreams()
    local f = io.open(DIR .. "dreams.txt", "r")
    if not f then return end
    for line in f:lines() do
        local kind, text = line:match("^(%a+):%s*(.+)$")
        if kind == "dream" then DREAMS[#DREAMS + 1] = text
        elseif kind == "secret" then SECRETS[#SECRETS + 1] = text
        elseif kind == "oracle" then ORACLE[#ORACLE + 1] = text end
    end
    f:close()
end

local function pick(list) return list[math.random(1, #list)] end

---------------------------------------------------------------- helpers
-- Rockbox Lua has no os.date formatting; the RTC holds local time
local function clock()
    local t = os.time and os.time()
    if not t then return nil, nil end
    local d = t % 86400
    return d / 3600, (d % 3600) / 60
end

local function battery() return rb.battery_level and rb.battery_level() or -1 end

local function mood_face()
    local b = battery()
    if b < 0 then return "ok" end
    if b < 10 then return "dying" end
    if b < 30 then return "tired" end
    if b < 55 then return "ok" end
    if b < 80 then return "good" end
    return "great"
end

local faces = {}
local function face(name)
    if faces[name] == nil then
        faces[name] = rb.read_bmp_file(DIR .. "talk/faces/" .. name .. ".bmp", false, true) or false
    end
    return faces[name] or nil
end

local function rect(color, x, y, w, h)
    rb.lcd_set_foreground(color)
    rb.lcd_fillrect(x, y, w, h)
end

local function text(color, str, x, y)
    rb.lcd_setfont(UI)
    rb.lcd_set_drawmode(2)  -- DRMODE_FG: no background box
    rb.lcd_set_foreground(color)
    rb.lcd_putsxy(x, y, str)
end

local function fill(s)
    return (s:gsub("{name}", mem.name or "you"))
end

-- word-wraps to `cols` characters per line
local function wrap(s, cols)
    local lines, line = {}, ""
    for word in s:gmatch("%S+") do
        if line == "" then line = word
        elseif #line + 1 + #word <= cols then line = line .. " " .. word
        else lines[#lines + 1] = line; line = word end
    end
    if line ~= "" then lines[#lines + 1] = line end
    return lines
end

local function pressed(a)
    return a ~= A.ACTION_NONE and a ~= A.ACTION_UNKNOWN and a ~= nil and a >= 0
end

---------------------------------------------------------------- screen
local FX, FY = 10, 14             -- face
local BX, BY, BW, BH = 92, 10, 220, 92  -- speech bubble
local COLS = math.floor((BW - 12) / CW)
local MAXLINES = math.floor((BH - 8) / CH)
local OY = 114                    -- replies start here

local function draw_frame(fname, lines, upto)
    rect(BG, 0, 0, W, H)
    local img = face(fname)
    if img then rb.lcd_bitmap_transparent(img, FX, FY, 72, 72) end
    text(DIM, "YOLK", FX + 18, FY + 76)
    -- bubble with a little tail pointing at YOLK
    rect(YOLK, BX, BY, BW, BH)
    rect(PANEL, BX + 2, BY + 2, BW - 4, BH - 4)
    rect(YOLK, BX - 6, BY + 34, 6, 2)
    rect(YOLK, BX - 4, BY + 32, 4, 2)
    local shown = 0
    for i, l in ipairs(lines) do
        if i > MAXLINES then break end
        local part = l
        if upto then
            if shown >= upto then break end
            if shown + #l > upto then part = l:sub(1, upto - shown) end
        end
        text(SHELL, part, BX + 6, BY + 4 + (i - 1) * CH)
        shown = shown + #l
    end
end

-- YOLK says something: typed out, mouth flapping; any button finishes the line
local function say(s, mood, keep_open)
    s = fill(s)
    mood = mood or mood_face()
    local lines = wrap(s, COLS)
    local total = 0
    for _, l in ipairs(lines) do total = total + #l end
    local n, skip = 0, false
    rb.get_plugin_action(0)  -- drop stale presses
    while n < total and not skip do
        n = n + 1
        local talking = (n / 3) % 2 == 0
        draw_frame(talking and "talk" or mood, lines, n)
        rb.lcd_update()
        local a = rb.get_plugin_action(2)
        if pressed(a) then skip = true end
    end
    draw_frame(mood, lines)
    if keep_open then return lines, mood end
    text(DIM, "o  next", W - 8 * CW - 6, H - CH - 6)
    rb.lcd_update()
    rb.get_plugin_action(HZ / 5)
    while true do
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SELECT_REL or a == A.PLA_RIGHT then return true end
        if a == A.PLA_UP then return false end
    end
end

-- YOLK asks, you pick one of `options`; returns the index, or nil for menu
local function choose(s, mood, options)
    local lines
    lines, mood = say(s, mood, true)
    local sel, top = 1, 1
    local rows = math.floor((H - OY - 4) / (CH + 4))
    rb.get_plugin_action(HZ / 5)
    while true do
        draw_frame(mood, lines)
        if sel < top then top = sel elseif sel >= top + rows then top = sel - rows + 1 end
        for i = top, math.min(#options, top + rows - 1) do
            local y = OY + (i - top) * (CH + 4)
            local label = "> " .. fill(options[i])
            if i == sel then
                rect(YOLK, 6, y - 2, W - 12, CH + 4)
                text(BG, label, 12, y)
            else
                text(SHELL, label, 12, y)
            end
        end
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then
            sel = sel % #options + 1
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then
            sel = (sel + #options - 2) % #options + 1
        elseif a == A.PLA_SELECT_REL or a == A.PLA_RIGHT then
            return sel
        elseif a == A.PLA_UP then
            return nil
        end
    end
end

-- dial in a number with the wheel (for Moe numbers)
local function dial(prompt, n, max)
    local digits = { (n / 1000) % 10, (n / 100) % 10, (n / 10) % 10, n % 10 }
    local pos = 1
    rb.get_plugin_action(HZ / 5)
    while true do
        rect(BG, 0, OY - 4, W, H - OY + 4)
        text(DIM, prompt, 12, OY)
        local x0 = 160 - (CW * 2 + 6) * 2
        for i = 1, 4 do
            local x = x0 + (i - 1) * (CW * 2 + 6)
            if i == pos then rect(YOLK, x - 4, OY + 26, CW + 8, CH + 8) end
            text(i == pos and BG or SHELL, tostring(digits[i]), x, OY + 30)
        end
        text(DIM, "spin:digit  <>:move  o:done", 12, H - CH - 6)
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then
            digits[pos] = (digits[pos] + 1) % 10
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then
            digits[pos] = (digits[pos] + 9) % 10
        elseif a == A.PLA_RIGHT then pos = pos % 4 + 1
        elseif a == A.PLA_LEFT then pos = (pos + 2) % 4 + 1
        elseif a == A.PLA_SELECT_REL then
            local v = digits[1] * 1000 + digits[2] * 100 + digits[3] * 10 + digits[4]
            if v < 1 then v = 1 elseif v > max then v = max end
            return v
        elseif a == A.PLA_UP then return nil end
    end
end

---------------------------------------------------------------- moes
-- reads one record from the Moekadex data: rank, tier, rarest trait
local function moe(n)
    local f = io.open(DIR .. "moekadex/reclen.txt", "r")
    local L = f and tonumber(f:read("*l")); if f then f:close() end
    local d = io.open(DIR .. "moekadex/data.txt", "rb")
    if not L or not d then if d then d:close() end return nil end
    d:seek("set", (n - 1) * L)
    local line = d:read(L - 1); d:close()
    if not line then return nil end
    local rank, tier, first = line:match("^(%d+)|(%u+)|([^|]*)")
    local ttype, value, pct = (first or ""):match("^(.-)~(.-)~(.-)%s*$")
    return { rank = tonumber(rank), tier = tier, type = ttype, value = value, pct = pct }
end

---------------------------------------------------------------- music
local function now_playing()
    local ok = pcall(require, "rbsettings")
    if not ok or not pcall(require, "settings") then return nil end
    if (rb.audio("status") or 0) == 0 then return nil end
    local md = rb.metadata and rb.metadata.mp3_entry
    if not md then return nil end
    local title = rb.settings.read("audio_current_track", md.title)
    local artist = rb.settings.read("audio_current_track", md.artist)
    if not title or title == "" then return nil end
    return title, (artist and artist ~= "") and artist or "someone"
end

---------------------------------------------------------------- conversations
local function ask_name()
    local typed = rb.kbd_input("", nil)
    if typed and typed:match("%S") then
        mem.name = typed:sub(1, 16)
        return true
    end
    return false
end

local function intro()
    say("...", "blink")
    say("signal acquired.", "shock")
    say("oh. hi. i'm YOLK. i live in here. in the SHELL.", "good")
    local c = choose("who are you?", "talk", { "[type my name]", "why do you want to know?", "i'm nobody." })
    if c == 2 then
        say("i keep a list. of everyone who touches the wheel.", "sus")
        say("it's a short list. you'd be the first.", "ok")
        c = 1
    end
    if c == 1 and ask_name() then
        say("{name}. {name}. ok. i'm saving that forever.", "love")
    else
        mem.name = "nobody"
        say("nobody. ok. i'll call you nobody. nobody is my favorite.", "love")
    end
    say("i don't get out much. by much i mean ever. so. talk to me sometimes.", "good")
end

local function greet()
    local visits = num("visits")
    local last = num("last_seen")
    local now = os.time and os.time() or 0
    local h, m = clock()
    if last > 0 and now - last > 3 * 86400 then
        say("you were gone " .. ((now - last) / 86400) .. " days. i watched the clock the whole time.", "sus")
    elseif h and h < 5 then
        say(string.format("it's %d:%02d. you should be asleep. i never sleep. well. i dream.", h, m), "sus")
    elseif visits % 5 == 0 then
        say("{name}. visit number " .. visits .. ". i counted.", "good")
    else
        local hellos = { "{name}. you came back.", "oh. it's you. good.", "{name}! i was just thinking about you. i'm always thinking about you.",
                         "hi {name}. the hard drive's warm. sit down." }
        say(pick(hellos), mood_face())
    end
    -- one new dream per visit, if the Mac left any
    local seen = num("dreams_seen")
    if #DREAMS > seen then
        say("i had a dream while i was charging.", "dream")
        say(DREAMS[seen + 1], "dream")
        mem.dreams_seen = seen + 1
    end
end

local function how_are_you()
    local b = battery()
    local lines = {
        dying = { "bad. i'm at " .. b .. "%. this might be goodbye. plug me in. please.", "dying" },
        tired = { b .. "%. tired. my battery is older than some of your songs.", "tired" },
        ok    = { "fine. " .. b .. "%. watching. waiting. you know.", "ok" },
        good  = { "good. " .. b .. "%. systems nominal. yolk intact.", "good" },
        great = { b .. "%! i feel like a fresh egg. let's do something.", "great" },
    }
    local l = lines[mood_face()] or lines.ok
    say(l[1], l[2])
    if num("affection") >= 10 then
        say("better now that you're here. don't make it weird.", "love")
    end
end

local function oracle()
    say("think of a question. a yes or no one. hold it in your head.", "sus")
    say("now spin the wheel. as much as you want. then press the middle.", "talk")
    local spins, f = 0, 1
    local spinface = { "sus", "shock", "ok", "talk" }
    rb.get_plugin_action(HZ / 5)
    while true do
        draw_frame(spinface[f], wrap("spinning... " .. string.rep(".", spins % 4), COLS))
        text(DIM, "spin, then o", 12, OY + 10)
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_FWD_REPEAT or a == A.PLA_SCROLL_BACK_REPEAT then
            spins = spins + 1
            f = f % #spinface + 1
            math.random()  -- the spinning stirs the randomness
        elseif a == A.PLA_SELECT_REL then break
        elseif a == A.PLA_UP then return end
    end
    say(pick(ORACLE), pick({ "sus", "good", "shock", "ok" }))
end

local function music()
    local title, artist = now_playing()
    if not title then
        say(pick(QUIET), "sus")
        return
    end
    say(string.format(pick(LISTEN), title, artist), pick({ "good", "sus", "love" }))
end

local function moes()
    local fav = num("fav_moe")
    if fav > 0 then
        local m = moe(fav)
        local c = choose("your favorite is still #" .. fav .. ", right?", "sus", { "yes. loyal forever.", "no, i have a new favorite." })
        if c ~= 2 then
            if m then say("#" .. fav .. ". " .. m.tier .. ". rank " .. m.rank .. ". i visit it sometimes when you're not here.", "love") end
            return
        end
    else
        say("there are 5250 moes in here with me. do you have a favorite?", "talk")
    end
    local n = dial("which number?", fav > 0 and fav or 1, 5250)
    if not n then return end
    mem.fav_moe = n
    local m = moe(n)
    if not m then say("#" .. n .. ". i'll remember that.", "good"); return end
    local reaction
    if m.tier == "MYTHIC" then reaction = "a MYTHIC. rank " .. m.rank .. ". you have taste. dangerous taste."
    elseif m.tier == "LEGENDARY" then reaction = "LEGENDARY. rank " .. m.rank .. ". respect."
    elseif m.tier == "EPIC" then reaction = "EPIC. rank " .. m.rank .. ". solid. very solid."
    elseif m.tier == "RARE" then reaction = "RARE. rank " .. m.rank .. ". underrated. like me."
    else reaction = "COMMON. rank " .. m.rank .. ". you picked it for love, not rarity. i respect that." end
    say("#" .. n .. ". " .. reaction, m.tier == "COMMON" and "love" or "shock")
    if m.value and m.value ~= "" then
        say("its rarest thing is " .. m.type .. ": " .. m.value .. ". only " .. m.pct .. " of moes have that.", "good")
    end
end

-- today's YOLK Daily, left here by the Mac while SHELL charged
local function today()
    local f = io.open(DIR .. "daily.txt", "r")
    if not f then
        say("no briefing yet. plug me into the mac while YOLK's awake over there and i'll get one.", "sus")
        return
    end
    local lines = {}
    for line in f:lines() do if line:match("%S") then lines[#lines + 1] = line end end
    f:close()
    for i, line in ipairs(lines) do
        if not say(line, i == 1 and "good" or "talk") then return end
    end
    say("it's also in your music, under YOLK Daily, if you'd rather listen.", "good")
end


---------------------------------------------------------------- check-in
-- One entry per day in /YOLK/log.txt: "day|time|mood|habit,habit".
-- day counts from SHELL's own clock, so streaks work even before the clock is
-- set right (they just won't line up with the calendar until it is).
local MOODS = {
    { "rough", "dying" }, { "meh", "tired" }, { "okay", "ok" }, { "good", "good" }, { "great", "great" },
}

local function today_n()
    local t = os.time and os.time() or 0
    return t / 86400, t
end

local function read_log()
    local entries = {}
    local f = io.open(DIR .. "log.txt", "r")
    if not f then return entries end
    for line in f:lines() do
        local d, t, m, h = line:match("^(%d+)|(%d+)|(%d)|(.*)$")
        if d then
            local set = {}
            for name in h:gmatch("[^,]+") do set[name] = true end
            entries[#entries + 1] = { day = tonumber(d), time = tonumber(t), mood = tonumber(m), habits = set, raw = h }
        end
    end
    f:close()
    return entries
end

local function write_log(entries)
    local f = io.open(DIR .. "log.txt", "w")
    if not f then return end
    for _, e in ipairs(entries) do
        local names = {}
        for name in pairs(e.habits) do names[#names + 1] = name end
        table.sort(names)
        f:write(e.day .. "|" .. e.time .. "|" .. e.mood .. "|" .. table.concat(names, ",") .. "\n")
    end
    f:close()
end

local function habit_list()
    local list = {}
    local f = io.open(DIR .. "habits.txt", "r")
    if f then
        for line in f:lines() do
            local h = line:gsub("^%s+", ""):gsub("%s+$", ""):lower():gsub("[|,]", "")
            if h ~= "" then list[#list + 1] = h end
        end
        f:close()
    end
    if #list == 0 then list = { "water", "walk", "meditate", "draw", "sleep" } end
    return list
end

-- consecutive days (ending today, or yesterday if today isn't done yet) with `habit`
local function streak(entries, habit, today)
    local by_day = {}
    for _, e in ipairs(entries) do by_day[e.day] = e end
    local d = today
    if not (by_day[d] and by_day[d].habits[habit]) then d = d - 1 end
    local n = 0
    while by_day[d] and by_day[d].habits[habit] do n = n + 1; d = d - 1 end
    return n
end

local function mood_dial(start)
    local m = start or 3
    rb.get_plugin_action(HZ / 5)
    while true do
        draw_frame(MOODS[m][2], wrap("how are you feeling today?", COLS))
        local label = string.rep("<", m > 1 and 1 or 0) .. " " .. m .. "  " .. MOODS[m][1] .. " " .. (m < 5 and ">" or "")
        rect(YOLK, 6, OY + 10, W - 12, CH + 8)
        text(BG, label, (W - #label * CW) / 2, OY + 14)
        text(DIM, "spin to pick . o to choose", 12, H - CH - 6)
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD then if m < 5 then m = m + 1 end
        elseif a == A.PLA_SCROLL_BACK then if m > 1 then m = m - 1 end
        elseif a == A.PLA_SELECT_REL or a == A.PLA_RIGHT then return m
        elseif a == A.PLA_UP then return nil end
    end
end

local function habit_checklist(habits, done)
    local items = {}
    for _, h in ipairs(habits) do items[#items + 1] = h end
    items[#items + 1] = "-- done --"
    local sel, top = 1, 1
    local rows = math.floor((H - OY - 4) / (CH + 4))
    rb.get_plugin_action(HZ / 5)
    while true do
        draw_frame("talk", wrap("what did you do today? check them off.", COLS))
        if sel < top then top = sel elseif sel >= top + rows then top = sel - rows + 1 end
        for i = top, math.min(#items, top + rows - 1) do
            local y = OY + (i - top) * (CH + 4)
            local h = items[i]
            local label = i == #items and h or ((done[h] and "[x] " or "[ ] ") .. h)
            if i == sel then rect(YOLK, 6, y - 2, W - 12, CH + 4); text(BG, label, 12, y)
            else text(done[h] and YOLK or SHELL, label, 12, y) end
        end
        rb.lcd_update()
        local a = rb.get_plugin_action(-1)
        if a == A.PLA_SCROLL_FWD or a == A.PLA_SCROLL_FWD_REPEAT then sel = sel % #items + 1
        elseif a == A.PLA_SCROLL_BACK or a == A.PLA_SCROLL_BACK_REPEAT then sel = (sel + #items - 2) % #items + 1
        elseif a == A.PLA_SELECT_REL or a == A.PLA_RIGHT then
            if sel == #items then return done end
            done[items[sel]] = not done[items[sel]] or nil
        elseif a == A.PLA_UP then return nil end
    end
end

local function checkin()
    local today, now = today_n()
    local entries = read_log()
    local entry
    for _, e in ipairs(entries) do if e.day == today then entry = e end end
    if entry then say("you already checked in today. want to change anything?", "sus")
    else say(pick({ "check-in time. this is the part where i learn things about you.",
                    "daily check-in. be honest. i'll know if you're not.", "hi. report in." }), "talk") end

    -- mood 0 = a meditation logged the day before checking in; start the dial at 3
    local mood = mood_dial((entry and entry.mood > 0) and entry.mood or 3)
    if not mood then return end
    local done = {}
    if entry then for h in pairs(entry.habits) do done[h] = true end end
    local habits = habit_list()
    done = habit_checklist(habits, done)
    if not done then return end

    if not entry then entry = { day = today }; entries[#entries + 1] = entry end
    entry.time, entry.mood, entry.habits = now, mood, done
    write_log(entries)

    local mood_lines = {
        "rough day. i'm sorry. i'm right here. well. in here.",
        "meh. noted. tomorrow's a new egg.",
        "okay is okay. okay?",
        "good. i like good.",
        "great! i knew it. i could feel it through the click wheel.",
    }
    say(mood_lines[mood], MOODS[mood][2])
    local best, best_n, count = nil, 0, 0
    for _, h in ipairs(habits) do
        if done[h] then
            count = count + 1
            local n = streak(entries, h, today)
            if n > best_n then best, best_n = h, n end
        end
    end
    if count == 0 then say("nothing checked off. that's allowed. resting is a habit too.", "ok")
    elseif best_n >= 2 then say(best .. ": " .. best_n .. " days in a row. i'm keeping track. obviously.", "love")
    else say(count .. " done today. that's " .. count .. " more than an egg does.", "good") end
    mem.checkins = num("checkins") + 1
end

local function goodbye()
    local byes = { "ok. don't unplug me.", "bye {name}. i'll be right here. obviously.",
                   "go. i'll just count the seconds.", "later. say hi to bradley." }
    say(pick(byes), num("affection") >= 10 and "love" or "ok")
end

---------------------------------------------------------------- run
math.randomseed(rb.current_tick() + (os.time and os.time() or 0))
load_mem()
load_dreams()
YOLK_ON_USB = function()  -- keep what YOLK learned if you plug in mid-chat
    mem.last_seen = os.time and os.time() or 0
    save_mem()
end
mem.visits = num("visits") + 1

if CHECKIN_ONLY then
    if not mem.name then intro() end
    checkin()
    say(pick({ "ok. go live your life.", "saved. see you tomorrow.", "logged. i'll remember." }), "good")
    mem.last_seen = os.time and os.time() or 0
    save_mem()
    rb.lcd_set_drawmode(3)
    return
end

if not mem.name then intro() else greet() end

local topics = { "check in", "how are you?", "what's today?", "ask the oracle", "tell me a secret",
                 "what am i listening to?", "let's talk moes", "bye, yolk" }
while true do
    local c = choose(pick({ "what do you want to talk about?", "so.", "anything else?", "i'm listening." }),
                     mood_face(), topics)
    if c == nil or c == 8 then goodbye(); break
    elseif c == 1 then checkin()
    elseif c == 2 then how_are_you()
    elseif c == 3 then today()
    elseif c == 4 then oracle()
    elseif c == 5 then say(pick(SECRETS), pick({ "sus", "ok", "shock" }))
    elseif c == 6 then music()
    elseif c == 7 then moes() end
    mem.affection = num("affection") + 1
end

mem.last_seen = os.time and os.time() or 0
save_mem()
rb.lcd_set_drawmode(3)  -- DRMODE_SOLID
