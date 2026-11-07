"""Builds moearmy/assets/ from the source art on the Desktop.

  ~/Desktop/moearmy/soldier.jpg  ->  assets/head_photo.png   (the Moe soldiers)
  ~/Desktop/moearmy/mouse.webp   ->  assets/mouse_head.png   (the Anti Moemoe mouse army)

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


def mouse():
    img = Image.open(MOUSE_SRC).convert("RGB")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon(MOUSE_OUTLINE, fill=255)
    mask = mask.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(1.5))   # pull the edge in a hair
    img.putalpha(mask)
    img = img.crop(mask.point(lambda v: 255 if v > 127 else 0).getbbox())
    img = img.resize((MOUSE_WIDTH, round(img.height * MOUSE_WIDTH / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, "mouse_head.png")
    img.save(path, optimize=True)
    print("wrote", path, img.size)


if __name__ == "__main__":
    main()
    mouse()
