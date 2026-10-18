"""A crayon and marker drawing kit (PIL only, no numpy).

Provenance: RubenTipparach/godot-sandbox tools/armory_art/crayon.py, unchanged but for this note
and the PNG `source` tag in save(). Falchion draws its marker-style building art with it
(tools/art/draw_marker_buildings.py, the hand-drawn-art skill).


The game's own upgrade icons (resources/sprites/upgrade icons/) are drawn by hand:
128 x 128, a transparent ground, no frame, flat colour laid in streaky marker
strokes with a darker and a lighter shade on top, a wobbly dark ink outline, and
sparks, dots and speed lines round the subject. This kit paints in that manner so
the Prototype Armory's icons sit beside them: every shape is a polygon that is
wobbled, filled with streaks and outlined in ink.

Work is done on a 512 canvas (S) and scaled down to 128 at the end, the way a
drawing made large and shrunk keeps its line weight.

    ic = Icon(seed=3)
    body = circle(256, 256, 150)
    ic.fill(body, (90, 160, 60), angle=30)
    ic.shade(body, (60, 110, 40), (1, 1))       # darker toward the lower right
    ic.shade(body, (150, 210, 110), (-1, -1), 0.45)  # a highlight up left
    ic.outline(body)
    ic.save("x.png")
"""

import math
import random
from PIL import Image, ImageDraw, ImageFilter

S = 512
OUT = 128
INK = (24, 20, 28)


# ---------- geometry ---------------------------------------------------------------

def circle(cx, cy, r, n=56, start=0.0):
    return [(cx + r * math.cos(start + 2 * math.pi * i / n), cy + r * math.sin(start + 2 * math.pi * i / n)) for i in range(n)]


def ellipse(cx, cy, rx, ry, n=56, rot=0.0):
    pts = [(rx * math.cos(2 * math.pi * i / n), ry * math.sin(2 * math.pi * i / n)) for i in range(n)]
    return translate(rotate(pts, rot), cx, cy)


def arc(cx, cy, r, a0, a1, n=40):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / (n - 1)), cy + r * math.sin(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]


def ring(cx, cy, r_out, r_in, n=56):
    """A ring as one polygon (out round, a hairline cut, back round inside)."""
    a = circle(cx, cy, r_out, n)
    b = circle(cx, cy, r_in, n)
    return a + [a[0], b[0]] + b[::-1] + [b[0]]


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def roundrect(x0, y0, x1, y1, r, n=8):
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -math.pi / 2), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, math.pi / 2), (x0 + r, y0 + r, math.pi)):
        for i in range(n + 1):
            a = a0 + (math.pi / 2) * i / n
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def star(cx, cy, r_out, r_in, points=5, rot=-math.pi / 2, jag=0.0, seed=0):
    rnd = random.Random(seed)
    pts = []
    for i in range(points * 2):
        r = r_out if i % 2 == 0 else r_in
        if jag:
            r *= 1.0 + rnd.uniform(-jag, jag)
        a = rot + math.pi * i / points
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def rotate(pts, ang, c=(0.0, 0.0)):
    ca, sa = math.cos(ang), math.sin(ang)
    return [(c[0] + (x - c[0]) * ca - (y - c[1]) * sa, c[1] + (x - c[0]) * sa + (y - c[1]) * ca) for x, y in pts]


def translate(pts, dx, dy):
    return [(x + dx, y + dy) for x, y in pts]


def scale(pts, k, c=(256.0, 256.0)):
    return [(c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k) for x, y in pts]


def centroid(pts):
    n = len(pts)
    return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def darker(c, t=0.35):
    return mix(c, (10, 8, 20), t)


def lighter(c, t=0.4):
    return mix(c, (255, 252, 235), t)


# ---------- the drawing --------------------------------------------------------------

class Icon:
    def __init__(self, seed=1):
        self.rnd = random.Random(seed)
        self.img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        # Halos live on their own layer, under everything, and skip the edge
        # crisping in final(): crisped, a soft glow turns into a hard disc.
        self.halo = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # The hand's tremor: a smooth offset along the line's normal.
    def _wobble(self, pts, closed=True, amp=3.0, step=7.0):
        if len(pts) < 2:
            return pts
        seq = list(pts) + ([pts[0]] if closed else [])
        out = []
        ph = [self.rnd.uniform(0, 6.28) for _ in range(3)]
        fr = [self.rnd.uniform(0.010, 0.020), self.rnd.uniform(0.03, 0.05), self.rnd.uniform(0.07, 0.11)]
        dist = 0.0
        for i in range(len(seq) - 1):
            (x0, y0), (x1, y1) = seq[i], seq[i + 1]
            seg = math.hypot(x1 - x0, y1 - y0)
            n = max(1, int(seg / step))
            nx, ny = (-(y1 - y0) / seg, (x1 - x0) / seg) if seg > 0 else (0, 0)
            for k in range(n):
                t = k / n
                d = dist + seg * t
                w = amp * (0.6 * math.sin(d * fr[0] + ph[0]) + 0.3 * math.sin(d * fr[1] + ph[1]) + 0.15 * math.sin(d * fr[2] + ph[2]))
                out.append((x0 + (x1 - x0) * t + nx * w, y0 + (y1 - y0) * t + ny * w))
            dist += seg
        if not closed:
            out.append(seq[-1])
        return out

    def _mask(self, poly):
        m = Image.new("L", (S, S), 0)
        ImageDraw.Draw(m).polygon([(round(x), round(y)) for x, y in poly], fill=255)
        return m

    def _streaks(self, color, angle, width, var, bbox):
        """A layer of marker strokes across bbox at `angle` degrees, each a shade
        of `color` within `var`."""
        layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        x0, y0, x1, y1 = bbox
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        half = math.hypot(x1 - x0, y1 - y0) / 2 + width
        a = math.radians(angle)
        ux, uy = math.cos(a), math.sin(a)
        vx, vy = -uy, ux
        off = -half
        while off < half:
            t = self.rnd.uniform(-var, var)
            c = mix(color, (255, 255, 240), t) if t > 0 else mix(color, (0, 0, 10), -t)
            w = max(2, int(width * self.rnd.uniform(0.7, 1.25)))
            px, py = cx + vx * off, cy + vy * off
            line = [(px - ux * half, py - uy * half), (px + ux * half, py + uy * half)]
            line = self._wobble(line, closed=False, amp=width * 0.35, step=10)
            d.line(line, fill=c + (255,), width=w, joint="curve")
            off += width * self.rnd.uniform(0.55, 0.85)
        return layer

    def fill(self, poly, color, angle=None, width=9, var=0.10, wobble=2.5):
        poly = self._wobble(poly, amp=wobble)
        m = self._mask(poly)
        if angle is None:
            angle = self.rnd.uniform(20, 70)
        base = Image.new("RGBA", (S, S), color + (255,))
        self.img.paste(base, (0, 0), m)
        bbox = m.getbbox() or (0, 0, S, S)
        layer = self._streaks(color, angle, width, var, bbox)
        self._comp(layer, m)
        self._last = (poly, m)
        return poly

    def shade(self, poly, color, direction, amount=0.5, width=8, angle=None, var=0.06):
        """Streaks of `color` over the part of `poly` lying toward `direction`:
        `amount` 0 to 1 is how far across the shape it reaches."""
        m = self._mask(self._wobble(poly, amp=2.0))
        cx, cy = centroid(poly)
        dx, dy = direction
        dl = math.hypot(dx, dy) or 1.0
        dx, dy = dx / dl, dy / dl
        ext = max(math.hypot(x - cx, y - cy) for x, y in poly)
        cut = ext * (1.0 - 2.0 * amount)
        # a band from the cut line outwards, wobbled so the edge is drawn, not ruled
        px, py = -dy, dx
        mx, my = cx + dx * cut, cy + dy * cut
        far = 2 * S
        half = [(mx - px * far, my - py * far), (mx + px * far, my + py * far),
                (mx + px * far + dx * far, my + py * far + dy * far), (mx - px * far + dx * far, my - py * far + dy * far)]
        h = self._mask(self._wobble(half, amp=6, step=12))
        from PIL import ImageChops
        mm = ImageChops.multiply(m, h)
        if angle is None:
            angle = math.degrees(math.atan2(dy, dx)) + 90 + self.rnd.uniform(-15, 15)
        bbox = mm.getbbox()
        if not bbox:
            return
        layer = self._streaks(color, angle, width, var, bbox)
        self._comp(layer, mm)

    def _comp(self, layer, mask):
        a = layer.getchannel("A")
        from PIL import ImageChops
        layer.putalpha(ImageChops.multiply(a, mask))
        self.img.alpha_composite(layer)

    def outline(self, poly, color=INK, width=10, closed=True, amp=2.5, passes=2):
        d = ImageDraw.Draw(self.img)
        for p in range(passes):
            line = self._wobble(poly, closed=closed, amp=amp + p)
            if closed:
                line = line + [line[0]]
            d.line(line, fill=color + (255,), width=max(2, width - p * 3), joint="curve")
            for x, y in (line[0], line[-1]):
                r = max(1, (width - p * 3) // 2)
                d.ellipse((x - r, y - r, x + r, y + r), fill=color + (255,))

    def shape(self, poly, color, light=(-1, -1), dark_amt=0.45, light_amt=0.30, ink=INK, ink_w=10, angle=None, width=9):
        """The usual: a filled shape, shaded dark away from the light and lit
        toward it, inked round."""
        self.fill(poly, color, angle=angle, width=width)
        self.shade(poly, darker(color, 0.35), (-light[0], -light[1]), dark_amt)
        if light_amt > 0:
            self.shade(poly, lighter(color, 0.35), light, light_amt, width=6)
        if ink:
            self.outline(poly, ink, ink_w)

    def line(self, pts, color, width=8, amp=2.0, ink=None, ink_w=None):
        """A drawn line (a beam, a rope, a speed line), optionally inked under."""
        d = ImageDraw.Draw(self.img)
        w = self._wobble(pts, closed=False, amp=amp)
        if ink:
            d.line(w, fill=ink + (255,), width=width + (ink_w or 8), joint="curve")
        d.line(w, fill=color + (255,), width=width, joint="curve")
        r = width // 2
        for x, y in (w[0], w[-1]):
            d.ellipse((x - r, y - r, x + r, y + r), fill=color + (255,))

    def dot(self, x, y, r, color, ink=None):
        d = ImageDraw.Draw(self.img)
        if ink:
            d.ellipse((x - r - 4, y - r - 4, x + r + 4, y + r + 4), fill=ink + (255,))
        d.ellipse((x - r, y - r, x + r, y + r), fill=color + (255,))

    def sparkle(self, x, y, r, color=(255, 236, 120), ink=INK):
        """A four point twinkle, the kind round the mineral and cryo icons."""
        p = star(x, y, r, r * 0.28, 4, rot=-math.pi / 2)
        self.fill(p, color, width=5, wobble=1)
        if ink:
            self.outline(p, ink, 6, amp=1)

    def speed(self, x, y, length, angle_deg, color=(240, 240, 240), width=7, ink=None):
        a = math.radians(angle_deg)
        self.line([(x, y), (x + math.cos(a) * length, y + math.sin(a) * length)], color, width, amp=1.5, ink=ink, ink_w=6)

    def zap(self, pts, color=(255, 236, 90), width=9, jag=16, seed=0):
        """A lightning stroke along pts, jagged."""
        rnd = random.Random(seed)
        out = []
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            n = max(2, int(math.hypot(x1 - x0, y1 - y0) / 28))
            for k in range(n):
                t = k / n
                out.append((x0 + (x1 - x0) * t + rnd.uniform(-jag, jag), y0 + (y1 - y0) * t + rnd.uniform(-jag, jag)))
        out.append(pts[-1])
        d = ImageDraw.Draw(self.img)
        d.line(out, fill=INK + (255,), width=width + 8, joint="curve")
        d.line(out, fill=color + (255,), width=width, joint="curve")
        d.line(out, fill=lighter(color, 0.6) + (255,), width=max(2, width // 3), joint="curve")

    def glow(self, poly_or_center, color, radius=30, strength=0.55):
        """A soft halo under the whole drawing (it is kept on its own layer)."""
        m = Image.new("L", (S, S), 0)
        dr = ImageDraw.Draw(m)
        if isinstance(poly_or_center, tuple):
            x, y, r = poly_or_center
            dr.ellipse((x - r, y - r, x + r, y + r), fill=int(255 * strength))
        else:
            dr.polygon(poly_or_center, fill=int(255 * strength))
        m = m.filter(ImageFilter.GaussianBlur(radius))
        layer = Image.new("RGBA", (S, S), color + (0,))
        layer.putalpha(m)
        self.halo.alpha_composite(layer)

    def final(self):
        im = self.img.resize((OUT, OUT), Image.LANCZOS)
        # Crisp the edge the way a drawn icon's is: a soft alpha fringe at 128
        # reads as blur, not as a hand-drawn line.
        a = im.getchannel("A").point(lambda v: 0 if v < 40 else (255 if v > 200 else v))
        im.putalpha(a)
        halo = self.halo.resize((OUT, OUT), Image.LANCZOS)
        # A halo cut off by the canvas reads as a square tile: fade it out over
        # the outer 18 pixels so it never reaches the edge.
        from PIL import ImageChops
        fade = Image.new("L", (OUT, OUT), 0)
        fd = ImageDraw.Draw(fade)
        band = 18
        for i in range(band):
            v = int(255 * (i / band) ** 1.5)
            fd.rectangle((i, i, OUT - 1 - i, OUT - 1 - i), outline=v)
        fd.rectangle((band, band, OUT - 1 - band, OUT - 1 - band), fill=255)
        halo.putalpha(ImageChops.multiply(halo.getchannel("A"), fade))
        halo.alpha_composite(im)
        return halo

    def save(self, path):
        from PIL.PngImagePlugin import PngInfo
        meta = PngInfo()
        # Drawn by this kit, not by hand: tools/armory_art/build.py makes it again.
        meta.add_text("source", "falchion-marker")
        self.final().save(path, pnginfo=meta)
