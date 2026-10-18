"""A small pixel-art kit for 64 x 64 icons drawn by hand in code.

Provenance: the Canvas idea, its rect/outline_rect/dither/line and the palette's first entries are
RubenTipparach/godot-sandbox tools/art/gen_campaign_icons.py (Canvas) and gen_research_icons.py
(the palette measured off its shipped research icons, PICO-8 based). Falchion adds polygons,
ellipses and an oblique box, for buildings seen from three-quarters. The hand-drawn-art skill says
how to draw with it.

Rules the godot-sandbox set follows and these keep: 64 x 64 RGBA, transparent ground, a near-black
outline on every edge, flat colour with one darker and one lighter shade, checkerboard dither for
the in-between, the subject filling most of the frame, a soft ground shadow.
"""
from PIL import Image

W = H = 64

P = {
    "line": (26, 22, 30),
    "shadow": (20, 18, 26),
    "black": (0, 0, 0),
    "white": (255, 241, 232),
    "silver": (194, 195, 199),
    "slate": (95, 87, 79),
    "steel": (150, 158, 172),
    "steel_d": (96, 104, 120),
    "steel_l": (214, 220, 230),
    "dark": (58, 62, 74),
    "dark_d": (38, 41, 50),
    "deep": (51, 44, 69),
    "lavender": (131, 118, 156),
    "yellow": (255, 236, 39),
    "amber": (255, 193, 16),
    "orange": (255, 163, 0),
    "ember": (255, 118, 58),
    "red": (255, 0, 77),
    "red_d": (162, 44, 40),
    "plum": (126, 37, 83),
    "brown": (167, 109, 87),
    "brown_d": (110, 66, 52),
    "sand": (222, 195, 131),
    "green": (0, 228, 54),
    "jade": (0, 178, 81),
    "green_d": (0, 112, 60),
    "lime": (144, 236, 66),
    "mint": (122, 229, 156),
    "teal": (21, 200, 155),
    "sky": (41, 173, 255),
    "blue": (28, 94, 172),
    "steel_b": (62, 90, 125),
    "cyan": (94, 226, 240),
    "cyan_d": (44, 150, 176),
    "glass": (150, 230, 255),
    "gold": (240, 176, 48),
    "gold_d": (176, 116, 20),
    "gold_l": (255, 222, 130),
    "rust": (176, 92, 76),
    "coal": (36, 22, 28),
    "purple": (150, 118, 214),
    "purple_d": (92, 66, 150),
    "pink": (255, 119, 168),
}


def col(c):
    return P[c] if isinstance(c, str) else c


class Canvas:
    def __init__(self):
        self.px = [[(0, 0, 0, 0)] * W for _ in range(H)]

    def set(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < W and 0 <= y < H:
            c = col(c)
            self.px[y][x] = c if len(c) == 4 else c + (255,)

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < W and 0 <= y < H else (0, 0, 0, 0)

    def rect(self, x, y, w, h, c):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.set(i, j, c)

    def outline_rect(self, x, y, w, h, fill, edge="line"):
        self.rect(x, y, w, h, edge)
        self.rect(x + 1, y + 1, w - 2, h - 2, fill)

    def dither(self, x, y, w, h, c, phase=0):
        for j in range(y, y + h):
            for i in range(x, x + w):
                if (i + j + phase) % 2 == 0:
                    self.set(i, j, c)

    def line(self, x0, y0, x1, y1, c, thick=1):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            for t in range(thick):
                self.set(x0, y0 + t, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    # --- Falchion's additions -------------------------------------------------

    def poly(self, pts, fill, edge="line"):
        """A filled polygon (pixel centres inside it), outlined."""
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(int(min(xs)), int(max(xs)) + 1):
                if _inside(x + 0.5, y + 0.5, pts):
                    self.set(x, y, fill)
        if edge:
            for i in range(len(pts)):
                a, b = pts[i], pts[(i + 1) % len(pts)]
                self.line(a[0], a[1], b[0], b[1], edge)

    def ellipse(self, cx, cy, rx, ry, fill, edge="line"):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
                if d <= 1:
                    self.set(x, y, fill)
        if edge:
            for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
                for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                    d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
                    if d <= 1 and any(((x + dx + 0.5 - cx) / rx) ** 2 + ((y + dy + 0.5 - cy) / ry) ** 2 > 1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        self.set(x, y, edge)

    def dome(self, cx, cy, rx, ry, fill, edge="line", shade=None, light=None):
        """The top half of an ellipse standing on y = cy: a dome, outlined along its arc and base.
        `shade` darkens its right flank, `light` dithers a highlight on its upper left."""
        def inside(x, y):
            return y <= cy and ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1
        for y in range(int(cy - ry) - 1, int(cy) + 1):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if not inside(x, y):
                    continue
                c = fill
                if shade and x - cx > rx * 0.45:
                    c = shade
                if light and x - cx < -rx * 0.15 and y - cy < -ry * 0.35 and (x + y) % 2 == 0:
                    c = light
                self.set(x, y, c)
        if edge:
            for y in range(int(cy - ry) - 1, int(cy) + 1):
                for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                    if inside(x, y) and (y == int(cy) or any(not inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, -1)))):
                        self.set(x, y, edge)

    def shadow(self, cx, cy, rx, ry):
        """The soft ground shadow under a building: a dark ellipse, dithered at its rim."""
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
                if d <= 0.65 or (d <= 1 and (x + y) % 2 == 0):
                    self.set(x, y, P["shadow"] + (150,))

    def obox(self, x, y, w, h, d, front, top, side, edge="line"):
        """A box seen from the front and a little above-right: the front face at (x, y), w by h; the
        top and the right side go back `d` pixels up and to the right (half as far up)."""
        u = d // 2
        self.poly([(x, y), (x + w, y), (x + w + d, y - u), (x + d, y - u)], top, edge)
        self.poly([(x + w, y), (x + w + d, y - u), (x + w + d, y + h - u), (x + w, y + h)], side, edge)
        self.poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], front, edge)

    def window_row(self, x, y, n, step, c="glass", dark="steel_b", w=2, h=3):
        for i in range(n):
            self.rect(x + i * step, y, w, h, c)
            self.set(x + i * step + w - 1, y + h - 1, dark)

    def save(self, path, scale=1):
        im = Image.new("RGBA", (W, H))
        im.putdata([p for row in self.px for p in row])
        if scale > 1:
            im = im.resize((W * scale, H * scale), Image.NEAREST)
        im.save(path)
        return im


def _inside(x, y, pts):
    inside = False
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            inside = not inside
    return inside
