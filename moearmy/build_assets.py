"""Builds moearmy/assets/ from the source art on the Desktop.

  ~/Desktop/moearmy/soldier.jpg  ->  assets/head_photo.png   (the Moe soldiers)
  ~/Desktop/moearmy/mouse.webp   ->  assets/mouse_head.png   (the Anti Moemoe mouse army)
  ~/Desktop/moearmy/mouse_loved.webp -> assets/mouse_loved.png (the same mouse, heart eyes, once loved)
  ~/Desktop/moearmy/bradley.jpg  ->  assets/bradley_head.png (CEO Bradley, an unlockable player)
  ~/Desktop/moearmy/crayons.jpg  ->  assets/crayons_head.png (Commander Crayons, an unlockable player)
  ~/Desktop/moearmy/bluu.jpg     ->  assets/bluu_head.png    (General Bluu, an unlockable player)
  ~/Desktop/moearmy/brute.webp   ->  assets/brute_head.png   (the big tanky mouse, stage 4 and up)
  ~/Desktop/moearmy/brute_loved.webp -> assets/brute_loved.png (the same, heart eyes, once loved)
  ~/Desktop/moearmy/heart_official.webp -> assets/heart_face.png (the official moemoe heart, on the menus)
  ~/Desktop/moearmy/meower_wild.jpg  -> assets/meower_wild.png  (the wild Meower in the hat, saved in Boot Camp)
  ~/Desktop/moearmy/meower_smoke.jpg -> assets/meower_smoke.png (the smoking Meower: Strip citizen, factory worker)

Cuts each head out of its tank background and saves it small with a see-through background.
(The Moe's "PIXEL" face is hand-drawn in index.html, no file needed.)

Run with:  /usr/bin/python3 moearmy/build_assets.py
"""
import colorsys
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SRC = os.path.expanduser("~/Desktop/moearmy/soldier.jpg")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
HEAD_BOX = (230, 95, 1290, 1110)   # cap top to chin, in the source picture
OUT_WIDTH = 120                    # drawn about 24 game pixels wide, so 5x for sharp phones

# Hand-traced outline (source-picture coords) of everything below the cap brim: the hair, face and
# neck, cut off at the collar. The colour test alone keeps bits of the tank behind the hair, because
# the tank is nearly as dark as the hair. Above the brim the colour test is clean, so the outline is loose there.
OUTLINE = [
    (150, 0), (1460, 0), (1460, 560), (1290, 640), (1150, 645), (1110, 625), (1105, 680), (1095, 730),
    (1075, 780), (1065, 870), (1080, 920), (1135, 985), (1140, 1015), (1110, 1060), (1020, 1088),
    (850, 1095), (630, 1095), (530, 1075), (400, 1050), (280, 1042), (245, 1035), (250, 1010),
    (262, 900), (268, 750), (270, 590), (260, 550), (255, 450), (150, 450),
]


def subject_mask(img):
    """White = Moe, black = background. Cap greens, the white face, the black hair and bright patch colours."""
    w, h = img.size
    px = img.load()
    m = Image.new("L", img.size, 0)
    mp = m.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if (v < 0.22 or (s < 0.12 and v > 0.86) or (0.15 < hh < 0.30 and s > 0.38 and v > 0.25)
                    or (s > 0.5 and v > 0.5)):
                mp[x, y] = 255
    m = m.filter(ImageFilter.MedianFilter(9))

    # keep only the biggest blob (bits of tank that happen to match get dropped), then fill its holes
    small = m.resize((w // 4, h // 4), Image.NEAREST)
    sp = small.load()
    sw, sh = small.size
    seen = set()
    best = []
    for sx in range(sw):
        for sy in range(sh):
            if sp[sx, sy] and (sx, sy) not in seen:
                stack, comp = [(sx, sy)], []
                seen.add((sx, sy))
                while stack:
                    x, y = stack.pop()
                    comp.append((x, y))
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < sw and 0 <= ny < sh and sp[nx, ny] and (nx, ny) not in seen:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
                if len(comp) > len(best):
                    best = comp
    keep = Image.new("L", small.size, 0)
    kp = keep.load()
    for x, y in best:
        kp[x, y] = 255
    outside = keep.copy()
    ImageDraw.floodfill(outside, (0, 0), 100)
    ImageDraw.floodfill(outside, (sw - 1, 0), 100)
    op = outside.load()
    for x in range(sw):
        for y in range(sh):
            kp[x, y] = 0 if op[x, y] == 100 else 255
    return keep.resize((w, h), Image.NEAREST).filter(ImageFilter.GaussianBlur(2))


def main():
    os.makedirs(OUT, exist_ok=True)
    head = Image.open(SRC).convert("RGB").crop(HEAD_BOX)
    outline = Image.new("L", head.size, 0)
    ImageDraw.Draw(outline).polygon([(x - HEAD_BOX[0], y - HEAD_BOX[1]) for x, y in OUTLINE], fill=255)
    outline = outline.filter(ImageFilter.GaussianBlur(1.5))
    mask = ImageChops.multiply(subject_mask(head), outline)
    head.putalpha(mask)
    head = head.crop(mask.point(lambda v: 255 if v > 127 else 0).getbbox())
    h = round(head.height * OUT_WIDTH / head.width)
    head = head.resize((OUT_WIDTH, h), Image.LANCZOS)
    path = os.path.join(OUT, "head_photo.png")
    head.save(path, optimize=True)
    print("wrote", path, head.size)


# The mouse has clean black outlines, so a hand-traced outline (source-picture coords) is the whole cut:
# ears, bandana and face down to the chin. Whiskers and the cigarette are left out.
MOUSE_SRC = os.path.expanduser("~/Desktop/moearmy/mouse.webp")
MOUSE_OUTLINE = [   # the bandana mouse: ears, bandana and knot (tails cut short), face down to the chin
    (170, 220), (230, 205), (330, 215), (410, 255), (455, 262), (500, 250), (590, 235), (640, 242),
    (700, 258), (760, 255), (850, 215), (950, 220), (1030, 268), (1065, 340), (1072, 430), (1052, 520),
    (1010, 580), (950, 612), (895, 618), (880, 660), (870, 705), (840, 750), (790, 795), (720, 828),
    (640, 842), (560, 835), (470, 810), (400, 778), (340, 745), (300, 725), (275, 690), (255, 650),
    (240, 610), (200, 575), (130, 535), (80, 460), (65, 370), (95, 285),
]
MOUSE_WIDTH = 150   # drawn about 30 game pixels wide (the ears make it wider than a Moe head)


def mouse(src=MOUSE_SRC, name="mouse_head.png"):
    img = Image.open(src).convert("RGB")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon(MOUSE_OUTLINE, fill=255)
    mask = mask.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(1.5))   # pull the edge in a hair
    img.putalpha(mask)
    img = img.crop(mask.point(lambda v: 255 if v > 127 else 0).getbbox())
    img = img.resize((MOUSE_WIDTH, round(img.height * MOUSE_WIDTH / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, optimize=True)
    print("wrote", path, img.size)


# CEO Bradley: a yellow heart head on a black background, so anything not near-black (inside the head box)
# is Bradley. The biggest bright blob is kept and its holes (the black eyes) filled in.
BRADLEY_SRC = os.path.expanduser("~/Desktop/moearmy/bradley.jpg")
BRADLEY_BOX = (100, 30, 840, 600)   # the heart, above the neck
BRADLEY_WIDTH = 130


def bradley():
    img = Image.open(BRADLEY_SRC).convert("RGB").crop(BRADLEY_BOX)
    w, h = img.size
    px = img.load()
    m = Image.new("L", img.size, 0)
    mp = m.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if max(r, g, b) > 70:
                mp[x, y] = 255
    m = m.filter(ImageFilter.MedianFilter(7))
    small = m.resize((w // 2, h // 2), Image.NEAREST)
    sp = small.load()
    sw, sh = small.size
    seen, best = set(), []
    for sx in range(sw):
        for sy in range(sh):
            if sp[sx, sy] and (sx, sy) not in seen:
                stack, comp = [(sx, sy)], []
                seen.add((sx, sy))
                while stack:
                    x, y = stack.pop()
                    comp.append((x, y))
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < sw and 0 <= ny < sh and sp[nx, ny] and (nx, ny) not in seen:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
                if len(comp) > len(best):
                    best = comp
    keep = Image.new("L", small.size, 0)
    kp = keep.load()
    for x, y in best:
        kp[x, y] = 255
    outside = keep.copy()
    ImageDraw.floodfill(outside, (0, 0), 100)
    op = outside.load()
    for x in range(sw):
        for y in range(sh):
            kp[x, y] = 0 if op[x, y] == 100 else 255
    mask = keep.resize((w, h), Image.NEAREST).filter(ImageFilter.GaussianBlur(1.5))
    img.putalpha(mask)
    img = img.crop(mask.point(lambda v: 255 if v > 127 else 0).getbbox())
    img = img.resize((BRADLEY_WIDTH, round(img.height * BRADLEY_WIDTH / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, "bradley_head.png")
    img.save(path, optimize=True)
    print("wrote", path, img.size)


# The official moemoe heart already has a see-through background, but its edge has a faint blue fringe.
HEART_SRC = os.path.expanduser("~/Desktop/moearmy/heart_official.webp")
HEART_WIDTH = 160


def heart():
    img = Image.open(HEART_SRC).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 140 or (b > r and b > g):   # the blue fringe and half-see-through edge
                px[x, y] = (0, 0, 0, 0)
    img = img.crop(img.getbbox())
    img = img.resize((HEART_WIDTH, round(img.height * HEART_WIDTH / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, "heart_face.png")
    img.save(path, optimize=True)
    print("wrote", path, img.size)


# Commander Crayons: hard hat + monster hood on a busy crayon drawing, so a hand-traced outline is the whole cut.
CRAYONS_SRC = os.path.expanduser("~/Desktop/moearmy/crayons.jpg")
CRAYONS_OUTLINE = [
    (45, 140), (50, 105), (68, 70), (100, 35), (140, 14), (180, 6), (222, 9), (258, 24), (285, 50),
    (300, 80), (306, 104), (332, 110), (362, 120), (366, 131), (346, 141), (312, 150), (316, 175),
    (318, 205), (312, 238), (300, 262), (288, 285), (268, 302), (132, 302), (110, 290), (80, 268),
    (64, 236), (55, 205), (52, 178),
]
CRAYONS_WIDTH = 150


def crayons():
    img = Image.open(CRAYONS_SRC).convert("RGB")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon(CRAYONS_OUTLINE, fill=255)
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(mask)
    img = img.crop(mask.point(lambda v: 255 if v > 127 else 0).getbbox())
    img = img.resize((CRAYONS_WIDTH, round(img.height * CRAYONS_WIDTH / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, "crayons_head.png")
    img.save(path, optimize=True)
    print("wrote", path, img.size)


# General Bluu: white face on a white background, so a hand-traced outline is the whole cut. The picture cuts
# off the top of the hair, so the round top of the head is drawn back on in the hair's black.
BLUU_SRC = os.path.expanduser("~/Desktop/moearmy/bluu.jpg")
BLUU_PAD = 45   # room added above the picture for the rest of the hair
BLUU_OUTLINE = [   # source-picture coords, from the hair's widest point down to the chin (the round top is an ellipse)
    (0, 95), (347, 95), (346, 160), (332, 178), (316, 205), (310, 232), (296, 240), (286, 268), (276, 296),
    (240, 293), (200, 291), (150, 289), (100, 283), (70, 262), (40, 225), (16, 185), (2, 140),
]
BLUU_WIDTH = 150


def bluu():
    src = Image.open(BLUU_SRC).convert("RGB")
    w, h = src.size
    img = Image.new("RGB", (w, h + BLUU_PAD), (16, 16, 18))
    img.paste(src, (0, BLUU_PAD))
    mask = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(mask)
    d.polygon([(x, y + BLUU_PAD) for x, y in BLUU_OUTLINE], fill=255)
    d.ellipse((0, 0, 350, 260), fill=255)   # the round top of the head
    px, mp = img.load(), mask.load()
    for y in range(BLUU_PAD + 140):           # up in the hair, anything light is background: make it hair
        for x in range(w):
            if mp[x, y] and sum(px[x, y]) > 200:
                px[x, y] = (16, 16, 18)
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(mask)
    img = img.crop(mask.point(lambda v: 255 if v > 127 else 0).getbbox())
    img = img.resize((BLUU_WIDTH, round(img.height * BLUU_WIDTH / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, "bluu_head.png")
    img.save(path, optimize=True)
    print("wrote", path, img.size)


# The brute: same cut as the bandana mouse, from a bigger picture. Ears, bandana knot (tails cut short), face to the chin.
BRUTE_OUTLINE = [
    (130, 300), (140, 170), (200, 80), (290, 40), (380, 50), (450, 90), (500, 130), (560, 50), (620, 30), (700, 40),
    (760, 70), (800, 40), (900, 30), (990, 70), (1050, 150), (1065, 250), (1040, 340), (980, 400), (900, 420),
    (880, 470), (850, 520), (780, 560), (700, 578), (600, 562), (520, 532), (440, 500), (380, 470), (330, 445),
    (250, 455), (185, 515), (150, 495), (200, 425), (165, 380),
]


def brute(src, name):
    img = Image.open(os.path.expanduser(src)).convert("RGB")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon(BRUTE_OUTLINE, fill=255)
    mask = mask.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(1.5))
    img.putalpha(mask)
    img = img.crop(mask.point(lambda v: 255 if v > 127 else 0).getbbox())
    img = img.resize((MOUSE_WIDTH, round(img.height * MOUSE_WIDTH / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, optimize=True)
    print("wrote", path, img.size)


# Meowers: cats the mice have tied up. Hand-traced outlines (source-picture coords), hat/ears down to the chin.
MEOWERS = {
    "meower_wild": [
        (105, 420), (110, 300), (160, 170), (260, 60), (400, 0), (620, 0), (760, 50), (830, 150), (850, 260),
        (880, 280), (950, 290), (945, 370), (900, 420), (865, 450), (860, 560), (800, 610), (700, 680),
        (560, 720), (420, 720), (300, 690), (200, 620), (140, 520),
    ],
    "meower_smoke": [
        (110, 180), (210, 170), (300, 110), (420, 60), (560, 50), (700, 80), (820, 150), (900, 230), (1060, 270),
        (1040, 370), (980, 450), (940, 560), (880, 650), (780, 720), (680, 790), (600, 790), (500, 770),
        (380, 740), (260, 680), (180, 600), (150, 500), (140, 380), (120, 280),
    ],
}
MEOWER_WIDTH = 140


def meower(name):
    img = Image.open(os.path.expanduser("~/Desktop/moearmy/" + name + ".jpg")).convert("RGB")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon(MEOWERS[name], fill=255)
    mask = mask.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(2))
    img.putalpha(mask)
    img = img.crop(mask.point(lambda v: 255 if v > 127 else 0).getbbox())
    img = img.resize((MEOWER_WIDTH, round(img.height * MEOWER_WIDTH / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, name + ".png")
    img.save(path, optimize=True)
    print("wrote", path, img.size)


if __name__ == "__main__":
    main()
    mouse()
    mouse(os.path.expanduser("~/Desktop/moearmy/mouse_loved.webp"), "mouse_loved.png")
    bradley()
    heart()
    crayons()
    bluu()
    brute("~/Desktop/moearmy/brute.webp", "brute_head.png")
    brute("~/Desktop/moearmy/brute_loved.webp", "brute_loved.png")
    meower("meower_wild")
    meower("meower_smoke")
