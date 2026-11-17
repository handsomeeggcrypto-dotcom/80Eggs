--[[ Shared by YOLK's apps (each one runs dofile("/YOLK/usb.lua") first).

     1. Safe saves. YOLK_SAVE(path, text) writes the new file next to the old one
        as "<path>.new", reads it back to be sure it landed, and only then swaps it
        in. If SHELL freezes or loses power partway, the old save is still there
        (or the finished .new is, and the next app start puts it back). A plain
        io.open(path, "w") wipes the old save first, so a freeze could lose it.

     2. When SHELL is plugged into a computer, save and get out of the way so
        Rockbox can hand the drive over. An app can set YOLK_ON_USB to a function
        that saves its state. Every button read goes through rb.get_plugin_action,
        so wrapping it catches the cable wherever the app happens to be waiting. ]]

if YOLK_USB_WRAPPED then return end
YOLK_USB_WRAPPED = true

---------------------------------------------------------------- safe saves
local function read_all(path)
    local f = io.open(path, "r")
    if not f then return nil end
    local s = f:read("*a")
    f:close()
    return s
end

-- a save that froze between "remove old" and "rename new" leaves only the .new
-- (finished and checked); one that froze while writing leaves the old file and a
-- half .new, which is thrown away
function YOLK_RECOVER(path)
    local new = path .. ".new"
    if not rb.file_exists(new) then return end
    if rb.file_exists(path) then os.remove(new) else os.rename(new, path) end
end

function YOLK_SAVE(path, s)
    local new = path .. ".new"
    local f = io.open(new, "w")
    if not f then return false end
    f:write(s)
    f:close()
    if read_all(new) ~= s then os.remove(new); return false end   -- didn't land: keep the old one
    os.remove(path)
    os.rename(new, path)
    return true
end

-- every file an app saves with YOLK_SAVE, fixed up before anything reads them
for _, p in ipairs({ "/YOLK/quests/state.txt", "/YOLK/hatch/state.txt", "/YOLK/memory.txt",
                     "/YOLK/log.txt", "/YOLK/med/last.txt", "/YOLK/moekadex/mine.txt",
                     "/YOLK/moekadex/last.txt", "/YOLK/dreams/mine.txt", "/YOLK/dreams/last.txt",
                     "/YOLK/moto/best.txt", "/YOLK/moto/best_crayons.txt", "/YOLK/moto/best_moemoe.txt",
                     "/YOLK/moto/best_glitch.txt", "/YOLK/moto/best_miami.txt" }) do
    YOLK_RECOVER(p)
end

---------------------------------------------------------------- the clock
-- SHELL's clock falls back to Jan 1 2000 when she loses power (a reset or the
-- battery unplugged), and apps can't set it. The Mac leaves its own time in
-- /YOLK/clock.txt on every sync (local time, the way Rockbox counts it), so if
-- her clock is behind that, or before 2026, it's wrong. Returns her year if so.
function YOLK_CLOCK_WRONG()
    local now = os.time and os.time() or 0
    local year = 1970 + math.floor(math.floor(now / 86400) * 4 / 1461)
    if now < 1767225600 then return year end              -- before 2026
    local f = io.open("/YOLK/clock.txt", "r")
    local mac = f and tonumber(f:read("*l"))
    if f then f:close() end
    if mac and now < mac - 3600 then return year end      -- behind the last sync
    return nil
end

---------------------------------------------------------------- plugged in
local read_action = rb.get_plugin_action
rb.get_plugin_action = function(...)
    local a = read_action(...)
    if a == rb.SYS_USB_CONNECTED then
        if YOLK_ON_USB then pcall(YOLK_ON_USB) end
        rb.lcd_set_drawmode(3)  -- DRMODE_SOLID, so Rockbox's own screens draw normally
        rb.default_event_handler(a)  -- Rockbox's USB screen; returns once unplugged
        os.exit()
    end
    return a
end
