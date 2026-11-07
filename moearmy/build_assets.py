"""Builds moearmy/assets/ from the source art on the Desktop.

  ~/Desktop/moearmy/soldier.jpg  ->  assets/head_photo.png

Cuts the soldier Moe's head (cap, face, hair) out of the tank background and saves it
small with a see-through background. The game's "PHOTO" face mode draws it on every soldier.
(The "PIXEL" face is hand-drawn in index.html, no file needed.)

Run with:  /usr/bin/python3 moearmy/build_assets.py
"""
import colorsys
import os

from PIL import Image, ImageDraw, ImageFilter

SRC = os.path.expanduser("~/Desktop/moearmy/soldier.jpg")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
HEAD_BOX = (230, 95, 1290, 1110)   # cap top to chin, in the source picture
OUT_WIDTH = 120                    # drawn about 24 game pixels wide, so 5x for sharp phones


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
    mask = subject_mask(head)
    head.putalpha(mask)
    head = head.crop(mask.point(lambda v: 255 if v > 127 else 0).getbbox())
    h = round(head.height * OUT_WIDTH / head.width)
    head = head.resize((OUT_WIDTH, h), Image.LANCZOS)
    path = os.path.join(OUT, "head_photo.png")
    head.save(path, optimize=True)
    print("wrote", path, head.size)


if __name__ == "__main__":
    main()
