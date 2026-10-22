--[[ Shared by YOLK's apps: when SHELL is plugged into a computer, save and get
     out of the way so Rockbox can hand the drive over.

     Each app runs dofile("/YOLK/usb.lua") first, and can set YOLK_ON_USB to a
     function that saves its state. Every button read goes through
     rb.get_plugin_action, so wrapping it catches the cable wherever the app
     happens to be waiting. ]]

if YOLK_USB_WRAPPED then return end
YOLK_USB_WRAPPED = true

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
