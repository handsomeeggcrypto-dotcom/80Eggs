#!/usr/bin/env python3
"""
Build step for the Cloud Dream ARPG demo.

Source art lives in ~/Desktop/diablo yumemono. The sprites already have
transparent backgrounds, so no white-stripping is needed. The real work:

  1. Slice each horizontal 4-frame strip into individual frames (even division
     first, then trim each frame to its own alpha bounding box, so uneven
     spacing and wands/effects that bleed past a column boundary are handled).

  2. NORMALISE SCALE. The source sheets are drawn at different pixel scales
     (the idle portrait is far larger than the wide attack strip), so a naive
     single scale would make the character grow/shrink between animations.
     For every animation we measure the character's *body height* -- the tall
     span of the WIDE part of the figure, which ignores a thin raised wand or
     lightning -- and rescale each animation so that body height is a constant
     STORE_BODY pixels. After this, every exported frame shares one scale and
     the game can draw them all with a single uniform factor.

  3. Foot-anchor each frame onto a per-animation uniform canvas (feet on a
     fixed baseline, body centered horizontally) so nothing jitters.

Outputs individual PNGs + meta.json.  Run once:  python3 preprocess.py
"""
import json, os
from PIL import Image, ImageChops, ImageDraw

SRC = os.path.expanduser("~/Desktop/diablo yumemono")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "processed")
os.makedirs(OUT, exist_ok=True)

ALPHA_THRESH = 12      # alpha <= this counts as empty
PAD = 6                # transparent padding around packed content
STORE_BODY = 200       # every animation normalised so body height == this (px)
BODY_WIDTH_FRAC = 0.22 # a row is "body" if its opaque width >= this * maxwidth


def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def strip_bg(im, thresh=60):
    """Some sheets bake a light checkerboard/white 'transparency' into the pixels.
    Flood-fill the connected background in from the 4 corners and make it truly
    transparent — interior light areas (e.g. a white apron) are preserved."""
    im = im.convert("RGBA")
    rgb = im.convert("RGB")
    w, h = im.size
    SENT = (255, 0, 255)
    for c in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        try:
            ImageDraw.floodfill(rgb, c, SENT, thresh=thresh)
        except Exception:
            pass
    mask = rgb.point(lambda v: 0)  # placeholder; build alpha via band compare
    r, g, b = rgb.split()
    # a pixel is background iff it was replaced by the sentinel (255,0,255)
    is_bg = ImageChops.multiply(
        ImageChops.multiply(r.point(lambda v: 255 if v == 255 else 0),
                            g.point(lambda v: 255 if v == 0 else 0)),
        b.point(lambda v: 255 if v == 255 else 0))
    keep = is_bg.point(lambda v: 0 if v else 255)      # 0 where bg, 255 elsewhere
    im.putalpha(ImageChops.darker(im.split()[3], keep))
    return im


def alpha_mask(im):
    return im.split()[3].point(lambda v: 255 if v > ALPHA_THRESH else 0)


def bbox(im):
    return alpha_mask(im).getbbox()


def trim(im):
    bb = bbox(im)
    return im.crop(bb) if bb else im


def slice_strip(im, n):
    """Split into n equal columns, trim each to its own alpha bbox."""
    w, h = im.size
    step = w / n
    out = []
    for i in range(n):
        col = im.crop((round(i * step), 0, round((i + 1) * step), h))
        bb = bbox(col)
        out.append(col.crop(bb) if bb else col)
    return out


def body_height(frame):
    """
    Height of the 'wide' part of the figure. Rows whose opaque-pixel count is a
    decent fraction of the widest row are body; thin wands/effects are excluded.
    """
    # Measure on a downscaled mask for speed; height ratios are preserved.
    mask = alpha_mask(frame)
    scale = min(1.0, 240 / max(mask.size))
    if scale < 1.0:
        mask = mask.resize((max(1, round(mask.width * scale)),
                            max(1, round(mask.height * scale))), Image.NEAREST)
    w, h = mask.size
    px = mask.load()
    row_counts = [sum(1 for x in range(w) if px[x, y]) for y in range(h)]
    maxw = max(row_counts) if row_counts else 0
    if maxw == 0:
        return frame.height
    thresh = maxw * BODY_WIDTH_FRAC
    rows = [y for y, c in enumerate(row_counts) if c >= thresh]
    span = (rows[-1] - rows[0] + 1) if rows else h
    return span / scale   # convert downscaled span back to SOURCE pixels


def pack_animation(prefix, name, frames, body_ref):
    """
    Normalise this animation to STORE_BODY, foot-anchor onto a uniform canvas,
    save frames, return meta {files, canvasW, canvasH, baselineY}.

    body_ref: 'median' -> body height = median over frames (locomotion/attack)
              int i     -> body height = frame i only (e.g. death: standing pose)
    """
    heights = [body_height(f) for f in frames]
    if body_ref == "median":
        s = sorted(heights)
        ref = s[len(s) // 2]
    else:
        ref = heights[int(body_ref)]
    scale = STORE_BODY / max(1, ref)

    scaled = [f.resize((max(1, round(f.width * scale)),
                        max(1, round(f.height * scale))), Image.LANCZOS)
              for f in frames]

    max_w = max(f.width for f in scaled)
    max_h = max(f.height for f in scaled)
    cw, ch = max_w + PAD * 2, max_h + PAD * 2
    baseline = ch - PAD

    files = []
    for i, fr in enumerate(scaled):
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        x = (cw - fr.width) // 2
        y = baseline - fr.height
        canvas.paste(fr, (x, y), fr)
        out_name = f"{prefix}_{name}_{i}.png"
        canvas.save(os.path.join(OUT, out_name))
        files.append(out_name)

    return {"files": files, "canvasW": cw, "canvasH": ch, "baselineY": baseline}


def pack_entity(prefix, specs):
    return {name: pack_animation(prefix, name, frames, ref)
            for name, (frames, ref) in specs.items()}


def process_tile(name, out, size=128):
    load(name).convert("RGB").resize((size, size), Image.LANCZOS)\
        .save(os.path.join(OUT, out))


def process_overlay(name, out, size=128, thresh=236):
    """Tile drawn OVER the floor (reeds/bush): strip near-white bg to transparent."""
    im = load(name)  # RGBA
    r, g, b, a = im.split()
    mn = ImageChops.darker(ImageChops.darker(r, g), b)   # per-pixel min channel
    newA = mn.point(lambda v: 0 if v >= thresh else 255)
    im.putalpha(ImageChops.darker(a, newA))
    im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, out))


def player_set(prefix, base):
    """Standard playable-character anim set (idle single frames, 4-frame walk/attack)."""
    return pack_entity(prefix, {
        "idle_down":   ([trim(load(base + "_idle_down.png"))], 0),
        "idle_up":     ([trim(load(base + "_idle_up.png"))], 0),
        "walk_down":   (slice_strip(load(base + "_walk_down.png"), 4), "median"),
        "walk_up":     (slice_strip(load(base + "_walk_up.png"), 4), "median"),
        "attack_down": (slice_strip(load(base + "_attack_down.png"), 4), "median"),
        "attack_up":   (slice_strip(load(base + "_attack_up.png"), 4), "median"),
    })


def foe_set(prefix, base):
    """Standard enemy anim set (idle single frame, 4-frame walk/attack/death)."""
    return pack_entity(prefix, {
        "idle":   ([trim(load(base + "_idle.png"))], 0),
        "walk":   (slice_strip(load(base + "_walk.png"), 4), "median"),
        "attack": (slice_strip(load(base + "_attack.png"), 4), "median"),
        "death":  (slice_strip(load(base + "_death.png"), 4), 0),  # frame0 standing
    })


def main():
    meta = {"storeBody": STORE_BODY, "chars": {}, "foes": {}, "misc": {}}

    # ---- Playable characters ------------------------------------------------
    # Egg keeps the legacy "player_*" / "enemy_*" filenames; new folks get their own.
    egg = pack_entity("player", {
        "idle_down":   ([trim(load("egg_idle_down.png"))], 0),
        "idle_up":     ([trim(load("egg_idle_up.png"))], 0),
        "walk_down":   (slice_strip(load("egg_walk_down.png"), 4), "median"),
        "walk_up":     (slice_strip(load("egg_walk_up.png"), 4), "median"),
        "attack_down": (slice_strip(load("egg_attack_down.png"), 4), "median"),
        "attack_up":   (slice_strip(load("egg_attack_up.png"), 4), "median"),
    })
    neogaucha = player_set("neo", "110")
    lua = player_set("lua", "lua")
    beek = player_set("beek", "beek")
    nap = player_set("nap", "nap")   # Napling, the daydreamer who made Yumemono
    imq = player_set("imq", "imq")   # IMQ ("I may quit"), a glorp alien with a taser

    # ---- Nightmares (enemies) ----------------------------------------------
    shadow_egg = pack_entity("enemy", {
        "idle":   ([trim(load("enemy_zombie_egg_idle.png"))], 0),
        "walk":   (slice_strip(load("enemy_zombie_egg_walk.png"), 4), "median"),
        "attack": (slice_strip(load("enemy_zombie_egg_attack.png"), 4), "median"),
        "death":  (slice_strip(load("enemy_zombie_egg_death.png"), 4), 0),
    })
    oni = foe_set("oni", "enemy_oni")
    siren = foe_set("siren", "enemy_nightmarelua")            # Nightmare Lua
    nightmarebeek = foe_set("nbeek", "enemy_nightmarebeek")   # demon-bunny Beek
    # IMS ("I may start") — sheets ship with a baked checkerboard bg; strip it.
    ims = pack_entity("ims", {
        "idle":   ([trim(strip_bg(load("enemy_ims_idle.png")))], 0),
        "walk":   (slice_strip(strip_bg(load("enemy_ims_walk.png")), 4), "median"),
        "attack": (slice_strip(strip_bg(load("enemy_ims_attack.png")), 4), "median"),
        "death":  (slice_strip(strip_bg(load("enemy_ims_death.png")), 4), 0),
    })

    # ---- Allies (summoned helpers) -----------------------------------------
    leech = pack_entity("leech", {   # Lua's Star Pal summon: a little axe guy
        "idle":   ([trim(load("companion_leech_idle.png"))], 0),
        "walk":   (slice_strip(load("companion_leech_walk.png"), 4), "median"),
        "attack": (slice_strip(load("companion_leech_attack.png"), 4), "median"),
        "summon": ([trim(load("companion_leech_summon.png"))], 0),
    })

    meta["chars"] = {"egg": egg, "neogaucha": neogaucha, "lua": lua, "beek": beek, "nap": nap, "imq": imq}
    meta["foes"] = {"shadow_egg": shadow_egg, "oni": oni, "siren": siren, "nightmarebeek": nightmarebeek, "ims": ims}
    meta["allies"] = {"leech": leech}
    meta["player"] = egg          # legacy aliases (kept for safety)
    meta["enemy"] = shadow_egg

    # ---- Tiles: cloud set + rooftop set ------------------------------------
    process_tile("tile_floor_cloud.png", "tile_floor.png")
    process_tile("tile_floor_cloud_var2.png", "tile_floor2.png")
    process_tile("tile_wall_cloud.png", "tile_wall.png")
    process_tile("tile_floor_rooftop.png", "tile_rooftop_floor.png")
    process_tile("tile_floor_rooftop_var2.png", "tile_rooftop_floor2.png")
    process_tile("tile_wall_chainlink.png", "tile_rooftop_wall.png")
    process_tile("tile_wall_brick_neon.png", "tile_rooftop_wall2.png")
    # library set (+ corruption tiles)
    process_tile("tile_floor_library_cloud.png", "tile_library_floor.png")
    process_tile("tile_floor_library_rug.png", "tile_library_floor2.png")
    process_tile("tile_wall_bookshelf.png", "tile_library_wall.png")
    process_tile("tile_wall_curtain.png", "tile_library_wall2.png")
    process_tile("tile_floor_library_corrupted.png", "tile_library_corrupt_floor.png")
    process_tile("tile_wall_bookshelf_corrupted.png", "tile_library_corrupt_wall.png")
    # pond meadow: solid floor/water/edge, overlay foliage (reeds/bush)
    process_tile("tile_floor_grass.png", "tile_pond_floor.png")
    process_tile("tile_floor_grass_var2.png", "tile_pond_floor2.png")
    process_tile("tile_water_pond.png", "tile_pond_water.png")
    process_tile("tile_water_pond_edge.png", "tile_pond_edge.png")
    process_overlay("tile_wall_reeds.png", "tile_pond_reeds.png")
    process_overlay("tile_wall_bush.png", "tile_pond_bush.png")
    # sunny meadow (all solid tiles + a picnic-blanket floor variant)
    process_tile("tile_floor_meadow_pink.png", "tile_meadow_floor.png")
    process_tile("tile_floor_meadow_flowers.png", "tile_meadow_floor2.png")
    process_tile("tile_floor_picnic_blanket.png", "tile_meadow_picnic.png")
    process_tile("tile_wall_blossomtree.png", "tile_meadow_wall.png")
    process_tile("tile_wall_cloudhedge.png", "tile_meadow_wall2.png")

    # spaceship (IMQ's level): pink/purple starship panels + porthole windows
    process_tile("tile_floor_starship.png", "tile_ship_floor.png")
    process_tile("tile_floor_starship_var2.png", "tile_ship_floor2.png")
    process_tile("tile_wall_spaceship_window.png", "tile_ship_wall.png")
    process_tile("tile_floor_outerspace.png", "tile_ship_wall2.png")

    # ---- Potion (single centred icon) --------------------------------------
    potion = trim(load("item_potion_health.png"))
    ph = 128
    pw = round(potion.width * ph / potion.height)
    potion.resize((pw, ph), Image.LANCZOS).save(os.path.join(OUT, "potion.png"))
    meta["misc"]["potion"] = {"file": "potion.png", "w": pw, "h": ph}

    # ---- VN speaker sprites (high-res trimmed full-body) --------------------
    def vn_sprite(src, out, target_h=620, strip=False):
        im = trim(strip_bg(load(src)) if strip else load(src))
        w = round(im.width * target_h / im.height)
        im.resize((w, target_h), Image.LANCZOS).save(os.path.join(OUT, out))
        return {"file": out, "w": w, "h": target_h}
    # dedicated talking portraits (busts) for story scenes
    def talk_sprite(src, out, th=620):
        im = trim(load(src))
        tw = round(im.width * th / im.height)
        im.resize((tw, th), Image.LANCZOS).save(os.path.join(OUT, out))
        return {"file": out, "w": tw, "h": th}
    meta["misc"]["vn_kumori"] = vn_sprite("egg_idle_down.png", "vn_kumori.png")
    meta["misc"]["vn_shadow"] = vn_sprite("enemy_zombie_egg_idle.png", "vn_shadow.png")

    # ---- food icons (trimmed, like the potion) -----------------------------
    def food_icon(src, out, h=160):
        im = trim(load(src))
        w = round(im.width * h / im.height)
        im.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, out))
        return {"file": out, "w": w, "h": h}
    meta["misc"]["foods"] = {
        "borgir": food_icon("item_burger_borgir.png", "food_borgir.png"),
        "apol":   food_icon("item_apple_apol.png",    "food_apol.png"),
        "tendie": food_icon("item_chicken_tendie.png","food_tendie.png"),
        "pizza":  food_icon("item_pizza.png",         "food_pizza.png"),
    }

    # ---- galaxy background (full nebula painting) ---------------------------
    gx = load("tile_wall_galaxy.png").convert("RGB").resize((1024, 1024), Image.LANCZOS)
    gx.save(os.path.join(OUT, "bg_galaxy.png"))
    meta["misc"]["bg_galaxy"] = {"file": "bg_galaxy.png", "w": 1024, "h": 1024}

    # ---- Egg's room (story background) -------------------------------------
    room = load("background_egg_scene.png").convert("RGB")
    rw = 1280; rh = round(room.height * rw / room.width)
    room.resize((rw, rh), Image.LANCZOS).save(os.path.join(OUT, "bg_egg_room.png"))
    meta["misc"]["bg_egg_room"] = {"file": "bg_egg_room.png", "w": rw, "h": rh}

    # ---- Egg talking portrait (bust) --------------------------------------
    meta["misc"]["vn_egg"] = talk_sprite("egg_talk.png", "vn_egg.png")

    # ---- Rooftop dream background ------------------------------------------
    rd = load("background_rooftop_dream.png").convert("RGB")
    rw = 1280; rh = round(rd.height * rw / rd.width)
    rd.resize((rw, rh), Image.LANCZOS).save(os.path.join(OUT, "bg_rooftop.png"))
    meta["misc"]["bg_rooftop"] = {"file": "bg_rooftop.png", "w": rw, "h": rh}

    # ---- Neogaucha VN speaker sprite (full-body idle) ---------------------
    meta["misc"]["vn_neogaucha"] = talk_sprite("110_talk.jpg", "vn_neogaucha.png")
    meta["misc"]["vn_oni"] = vn_sprite("enemy_oni_idle.png", "vn_oni.png")

    # ---- Cloud Library background + Lua VN sprite -------------------------
    lib = load("background_cloud_library.png").convert("RGB")
    lw = 1280; lh = round(lib.height * lw / lib.width)
    lib.resize((lw, lh), Image.LANCZOS).save(os.path.join(OUT, "bg_library.png"))
    meta["misc"]["bg_library"] = {"file": "bg_library.png", "w": lw, "h": lh}
    meta["misc"]["vn_lua"] = talk_sprite("lua_talk.jpg", "vn_lua.png")
    meta["misc"]["vn_siren"] = vn_sprite("enemy_nightmarelua_idle.png", "vn_siren.png")

    # ---- Pond Meadow background + Beek/bunny VN sprites -------------------
    pond = load("background_pond_meadow.png").convert("RGB")
    pw2 = 1280; ph2 = round(pond.height * pw2 / pond.width)
    pond.resize((pw2, ph2), Image.LANCZOS).save(os.path.join(OUT, "bg_pond.png"))
    meta["misc"]["bg_pond"] = {"file": "bg_pond.png", "w": pw2, "h": ph2}
    meta["misc"]["vn_beek"] = talk_sprite("beek_talk.png", "vn_beek.png")
    meta["misc"]["vn_nightmarebeek"] = vn_sprite("enemy_nightmarebeek_idle.png", "vn_nightmarebeek.png")

    # ---- Sunny Meadow background + Napling VN sprite ---------------------
    mead = load("background_sunny_meadow.png").convert("RGB")
    mw = 1280; mh = round(mead.height * mw / mead.width)
    mead.resize((mw, mh), Image.LANCZOS).save(os.path.join(OUT, "bg_meadow.png"))
    meta["misc"]["bg_meadow"] = {"file": "bg_meadow.png", "w": mw, "h": mh}
    meta["misc"]["vn_nap"] = talk_sprite("nap_talk.JPG", "vn_nap.png")

    # ---- Spaceship background + IMQ / IMS VN sprites --------------------
    ship = load("background_dream_spaceship.png").convert("RGB")
    sw = 1280; sh = round(ship.height * sw / ship.width)
    ship.resize((sw, sh), Image.LANCZOS).save(os.path.join(OUT, "bg_ship.png"))
    meta["misc"]["bg_ship"] = {"file": "bg_ship.png", "w": sw, "h": sh}
    meta["misc"]["vn_imq"] = talk_sprite("imq_talk.png", "vn_imq.png")
    meta["misc"]["vn_ims"] = vn_sprite("enemy_ims_idle.png", "vn_ims.png", strip=True)

    with open(os.path.join(OUT, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    # Also emit as JS so the game works from file:// (no fetch/CORS needed).
    with open(os.path.join(OUT, "meta.js"), "w") as f:
        f.write("window.GAME_META = " + json.dumps(meta) + ";\n")

    print("Done. Wrote", len(os.listdir(OUT)), "files.")
    for ent in ("player", "enemy"):
        for name, m in meta[ent].items():
            print(f"  {ent}.{name:12s} canvas {m['canvasW']}x{m['canvasH']} "
                  f"baseline {m['baselineY']}  ({len(m['files'])} frames)")


if __name__ == "__main__":
    main()
