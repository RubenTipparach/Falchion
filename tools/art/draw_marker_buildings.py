#!/usr/bin/env python3
"""Falchion's buildings drawn in marker: wobbly ink outlines, streaky marker fills with a darker and
a lighter shade, sparks and glows, with godot-sandbox's crayon kit (crayon.py). Drawn on a 512 px
canvas and shrunk to 128, so the line weight holds. Writes public/art/buildings/marker/<id>.png.

    python3 tools/art/draw_marker_buildings.py
"""
import math
import os

from crayon import Icon, circle, ellipse, rect, roundrect, star, darker, lighter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "art", "buildings", "marker"))

STEEL = (150, 160, 178)
STEEL_D = (98, 106, 124)
WHITE = (236, 232, 222)
GLASS = (140, 220, 250)
GOLD = (240, 182, 52)
RUST = (186, 96, 70)
BRICK = (170, 104, 80)
GREEN = (84, 196, 92)
LIME = (166, 230, 80)
SKY = (70, 160, 236)
RED = (226, 64, 70)
PURPLE = (150, 112, 214)
SAND = (226, 200, 140)
DARK = (60, 64, 78)
AMBER = (255, 196, 64)


def box(ic, x, y, w, h, d, color, top=None, side=None, ink_w=10):
    """A box seen from the front and above-right: front face x..x+w, y..y+h; top and side `d` deep."""
    u = d * 0.55
    top_p = [(x, y), (x + w, y), (x + w + d, y - u), (x + d, y - u)]
    side_p = [(x + w, y), (x + w + d, y - u), (x + w + d, y + h - u), (x + w, y + h)]
    front_p = rect(x, y, x + w, y + h)
    ic.shape(top_p, top or lighter(color, 0.25), dark_amt=0.2, light_amt=0.2, ink_w=ink_w)
    ic.shape(side_p, side or darker(color, 0.3), dark_amt=0.3, light_amt=0.0, ink_w=ink_w)
    ic.shape(front_p, color, ink_w=ink_w)
    return front_p


def dome(cx, cy, rx, ry, n=40):
    return [(cx + rx * math.cos(math.pi + math.pi * i / n), cy + ry * math.sin(math.pi + math.pi * i / n)) for i in range(n + 1)]


def windows(ic, x, y, n, step, w, h, color=GLASS, glow=False):
    for i in range(n):
        p = rect(x + i * step, y, x + i * step + w, y + h)
        if glow:
            ic.glow(p, color, radius=10, strength=0.35)
        ic.shape(p, color, dark_amt=0.25, light_amt=0.35, ink_w=6)


def ground(ic, w=200):
    ic.glow((256, 440, w), (20, 16, 30), radius=24, strength=0.5)


def farm():
    ic = Icon(seed=11)
    ground(ic)
    # water tower
    for x in (380, 432):
        ic.line([(x, 410), (x + 6, 250)], DARK, width=12, ink=(24, 20, 28), ink_w=6)
    tank = roundrect(352, 150, 470, 270, 30)
    ic.shape(tank, SKY)
    ic.shape(ellipse(411, 150, 59, 18), lighter(SKY, 0.4), ink_w=8)
    # the glass vault over crops
    back = dome(270, 330, 160, 150)
    ic.glow(back, GLASS, radius=20, strength=0.25)
    ic.shape(back + [(430, 330)], GLASS, light=(-1, -1), dark_amt=0.25, light_amt=0.45)
    for y, c in ((300, GREEN), (270, LIME), (240, GREEN)):
        for x in range(150, 400, 34):
            if abs(x - 270) < 150 - (330 - y) * 0.6:
                ic.shape(circle(x, y, 13, 10), c, ink_w=5, dark_amt=0.3, light_amt=0.2)
    for x in (170, 220, 270, 320, 370):
        ic.line([(x, 330), (x + (x - 270) * 0.05, 330 - math.sqrt(max(0, 150 ** 2 - (x - 270) ** 2)) * 0.97)], WHITE, width=6, amp=1)
    box(ic, 100, 330, 330, 80, 50, STEEL)
    for x in range(130, 400, 56):
        ic.shape(rect(x, 360, x + 30, 384), LIME, ink_w=6)
    return ic


def mine():
    ic = Icon(seed=12)
    ground(ic)
    ic.shape([(40, 420), (90, 320), (160, 300), (210, 380), (220, 420)], (120, 108, 104))
    ic.shape([(350, 420), (400, 350), (470, 345), (500, 420)], (120, 108, 104))
    # headframe legs and braces
    ic.line([(190, 400), (250, 90)], RUST, width=16, ink=(24, 20, 28), ink_w=8)
    ic.line([(340, 400), (280, 90)], RUST, width=16, ink=(24, 20, 28), ink_w=8)
    for y in (180, 270, 350):
        k = (400 - y) / 310
        ic.line([(190 + 60 * (1 - k) + 10, y), (340 - 60 * (1 - k) - 10, y)], RUST, width=10, ink=(24, 20, 28), ink_w=6)
    ic.line([(215, 350), (310, 180)], darker(RUST, 0.2), width=8)
    # the wheel
    ic.shape(circle(265, 90, 56), STEEL)
    ic.shape(circle(265, 90, 30), DARK, ink_w=8)
    for a in range(0, 360, 45):
        r = math.radians(a)
        ic.line([(265, 90), (265 + 52 * math.cos(r), 90 + 52 * math.sin(r))], STEEL_D, width=6, amp=0.5)
    ic.line([(265, 90), (265, 330)], WHITE, width=5, amp=0.5)
    box(ic, 180, 320, 160, 90, 40, (180, 60, 56))
    door = rect(235, 345, 285, 410)
    ic.glow(door, AMBER, radius=12, strength=0.4)
    ic.shape(door, (40, 30, 36), ink_w=6)
    # ore cart
    ic.shape([(360, 380), (470, 380), (455, 430), (375, 430)], STEEL_D)
    ic.shape([(370, 380), (395, 345), (430, 352), (460, 380)], GOLD, dark_amt=0.3)
    ic.sparkle(420, 330, 22)
    for x in (385, 445):
        ic.dot(x, 440, 14, DARK, ink=(24, 20, 28))
    return ic


def manufactory():
    ic = Icon(seed=13)
    ground(ic, 220)
    for (x, y, r) in ((360, 70, 36), (410, 40, 28), (320, 110, 30)):
        ic.shape(circle(x, y, r), (210, 210, 214), dark_amt=0.25, light_amt=0.3, ink_w=7)
    for x, top in ((330, 140), (390, 110)):
        p = rect(x, top, x + 40, 300)
        ic.shape(p, (150, 50, 60))
        ic.shape(rect(x, top + 25, x + 40, top + 45), WHITE, ink_w=6)
    box(ic, 50, 270, 360, 140, 60, BRICK)
    for i in range(4):
        x = 60 + i * 90
        ic.shape([(x, 270), (x + 40, 205), (x + 90, 235), (x + 90, 270)], RUST, ink_w=8)
        ic.shape([(x + 40, 205), (x + 50, 210), (x + 50, 270), (x + 8, 270)], GLASS, ink_w=6)
    windows(ic, 80, 300, 6, 52, 30, 34, AMBER, glow=True)
    ic.shape(rect(170, 350, 250, 410), DARK, ink_w=8)
    box(ic, 420, 350, 60, 60, 26, GOLD)
    return ic


def trade_hub():
    ic = Icon(seed=14)
    ground(ic, 220)
    pad = ellipse(110, 400, 80, 30)
    ic.shape(pad, DARK, dark_amt=0.2, light_amt=0.2)
    ic.shape(ellipse(110, 400, 40, 14), (40, 44, 56), ink_w=6)
    for x in (40, 110, 180):
        ic.dot(x, 400, 7, AMBER)
    box(ic, 140, 300, 260, 110, 50, STEEL)
    windows(ic, 160, 330, 7, 34, 20, 40, GLASS)
    ic.shape(rect(250, 350, 300, 410), DARK, ink_w=8)
    d = dome(280, 300, 115, 90)
    ic.shape(d + [(395, 300)], GOLD, dark_amt=0.4, light_amt=0.35)
    ic.line([(280, 210), (280, 90)], DARK, width=8)
    ic.glow((280, 85, 22), (255, 80, 80), radius=10, strength=0.6)
    ic.dot(280, 85, 12, RED, ink=(24, 20, 28))
    coin = circle(420, 150, 62)
    ic.glow(coin, AMBER, radius=16, strength=0.4)
    ic.shape(coin, GOLD, dark_amt=0.35, light_amt=0.4)
    ic.shape(circle(420, 150, 44), lighter(GOLD, 0.2), ink_w=6, dark_amt=0.2, light_amt=0.2)
    ic.shape(rect(410, 110, 430, 190), darker(GOLD, 0.3), ink_w=6)
    ic.line([(420, 212), (420, 300)], DARK, width=8)
    return ic


def shipyard():
    ic = Icon(seed=15)
    ground(ic, 230)
    for x in (40, 420):
        ic.shape(rect(x, 80, x + 50, 420), (240, 150, 40))
        for y in range(110, 410, 50):
            ic.line([(x + 6, y), (x + 44, y + 40)], DARK, width=6, amp=0.5)
    ic.shape(rect(40, 60, 470, 100), AMBER)
    hull = [(110, 290), (320, 240), (440, 280), (320, 330), (110, 330)]
    ic.shape(hull, (196, 206, 222), light=(-1, -1), dark_amt=0.45, light_amt=0.4)
    ic.shape(rect(90, 285, 115, 335), DARK, ink_w=8)
    ic.glow((80, 310, 26), (120, 230, 255), radius=14, strength=0.6)
    windows(ic, 160, 290, 5, 34, 14, 10, GLASS)
    for x in (160, 260, 360):
        ic.line([(x, 330), (x, 400)], DARK, width=12, ink=(24, 20, 28), ink_w=6)
    ic.shape(rect(90, 395, 420, 420), DARK, ink_w=8)
    ic.line([(210, 100), (210, 215)], DARK, width=5, amp=0.5)
    ic.shape(rect(190, 215, 230, 230), AMBER, ink_w=6)
    ic.glow((300, 230, 30), (255, 230, 120), radius=12, strength=0.7)
    ic.sparkle(300, 225, 26)
    ic.sparkle(330, 205, 14)
    return ic


def lab():
    ic = Icon(seed=16)
    ground(ic)
    box(ic, 80, 300, 280, 110, 60, WHITE, top=(220, 222, 228), side=(170, 176, 190))
    windows(ic, 105, 330, 5, 46, 30, 26, (110, 230, 240), glow=True)
    d = dome(215, 300, 130, 110)
    ic.shape(d + [(345, 300)], (210, 214, 222), dark_amt=0.4, light_amt=0.4)
    ic.shape([(200, 195), (235, 195), (240, 300), (195, 300)], (60, 50, 90), ink_w=8)
    ic.shape([(205, 215), (285, 110), (310, 130), (230, 235)], STEEL_D)
    ic.glow((300, 118, 16), GLASS, radius=10, strength=0.7)
    ic.line([(400, 280), (400, 210)], DARK, width=8)
    ic.shape(ellipse(410, 190, 60, 30), (220, 226, 236))
    ic.shape(ellipse(410, 190, 24, 12), STEEL, ink_w=6)
    flask = [(420, 320), (450, 320), (450, 350), (485, 410), (385, 410), (420, 350)]
    ic.glow(flask, LIME, radius=18, strength=0.5)
    ic.shape(flask, (190, 240, 150))
    ic.shape([(400, 380), (470, 380), (485, 410), (385, 410)], LIME, ink_w=6)
    return ic


def warehouse():
    ic = Icon(seed=17)
    ground(ic, 220)
    box(ic, 40, 220, 340, 190, 90, STEEL_D, top=STEEL, side=DARK)
    for x in range(55, 375, 24):
        ic.line([(x, 225), (x, 405)], STEEL, width=5, amp=0.8)
    for x in (75, 220):
        ic.shape(rect(x, 290, x + 110, 410), (210, 212, 218), dark_amt=0.3, light_amt=0.2)
        for y in range(300, 405, 16):
            ic.line([(x + 6, y), (x + 104, y)], (150, 154, 164), width=4, amp=0.5)
        ic.shape(rect(x, 285, x + 110, 296), AMBER, ink_w=6)
    box(ic, 390, 350, 60, 60, 30, (176, 120, 80))
    box(ic, 400, 290, 46, 50, 24, GREEN)
    ic.shape(roundrect(456, 360, 492, 420, 10), RED)
    return ic


def temple():
    ic = Icon(seed=18)
    ground(ic)
    box(ic, 60, 380, 340, 40, 40, SAND, top=lighter(SAND, 0.3))
    box(ic, 100, 300, 260, 80, 40, WHITE, top=SAND, side=(190, 150, 110))
    box(ic, 150, 220, 160, 80, 34, WHITE, top=SAND, side=(190, 150, 110))
    spire = [(205, 220), (255, 220), (238, 50), (222, 50)]
    ic.shape(spire, GOLD, dark_amt=0.4, light_amt=0.3)
    ic.glow((230, 40, 26), AMBER, radius=12, strength=0.6)
    ic.dot(230, 40, 14, (255, 236, 120), ink=(24, 20, 28))
    win = circle(230, 260, 26)
    ic.glow(win, (255, 120, 170), radius=16, strength=0.5)
    ic.shape(win, (255, 140, 180), ink_w=8)
    ic.shape(rect(200, 320, 260, 380), (120, 40, 86), ink_w=8)
    for x in (115, 345):
        ic.line([(x, 300), (x, 190)], DARK, width=6)
        ic.shape([(x, 190), (x + 34, 198), (x + 26, 225), (x + 34, 252), (x, 245)], PURPLE, ink_w=6)
    return ic


def capitol():
    ic = Icon(seed=19)
    ground(ic, 230)
    box(ic, 30, 380, 400, 40, 50, (220, 222, 228), top=WHITE)
    box(ic, 60, 250, 340, 130, 50, WHITE, top=(220, 222, 228), side=(170, 176, 190))
    for x in range(80, 390, 38):
        ic.shape(rect(x, 262, x + 20, 380), (230, 232, 238), dark_amt=0.4, light_amt=0.3, ink_w=6)
    ic.shape([(50, 250), (410, 250), (230, 170)], WHITE, dark_amt=0.3, light_amt=0.2)
    ic.shape(rect(150, 120, 310, 175), (210, 214, 222))
    for x in range(165, 300, 26):
        ic.line([(x, 128), (x, 168)], STEEL_D, width=5, amp=0.5)
    d = dome(230, 125, 92, 80)
    ic.shape(d + [(322, 125)], GOLD, dark_amt=0.4, light_amt=0.4)
    ic.line([(230, 45), (230, 0 + 10)], DARK, width=6)
    ic.shape([(234, 10), (300, 18), (285, 34), (300, 50), (234, 50)], RED, ink_w=6)
    return ic


BUILDINGS = {
    "farm": farm, "mine": mine, "manufactory": manufactory, "trade-hub": trade_hub,
    "shipyard": shipyard, "lab": lab, "warehouse": warehouse, "temple": temple, "capitol": capitol,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in BUILDINGS.items():
        fn().save(os.path.join(OUT, f"{name}.png"))
    print("wrote", len(BUILDINGS), "marker buildings to", os.path.relpath(OUT))


if __name__ == "__main__":
    main()
