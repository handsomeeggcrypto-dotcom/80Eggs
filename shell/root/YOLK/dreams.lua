--[[ DREAM THINGS // every Yumemono angel, on SHELL
     Same controls as Moekadex, which does the work; this just sets the dreamy look. ]]
DEX = {
    dir = "/YOLK/dreams/",
    count = 5200,
    item = "DREAM",
    tagline = "5200 angels dreamt from latent space",
    tagline_color = { 92, 74, 170 },     -- lavender, readable over the splash clouds
    pic_w = 138, pic_h = 184,            -- Yumemono art is 3:4 portrait
    fallback = "fallback.bmp",           -- a little cloud while pictures load
    colors = {
        bg = { 27, 22, 64 },             -- night sky
        bar = { 92, 74, 170 },           -- lavender dusk
        accent = { 255, 179, 217 },      -- dream pink
        text = { 250, 244, 255 },        -- cloud white
        dim = { 176, 160, 230 },
    },
}
dofile("/YOLK/moekadex.lua")
