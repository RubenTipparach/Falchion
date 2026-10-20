#!/usr/bin/env python3
"""Falchion's buildings in pixel art: 64 x 64, drawn by hand pixel by pixel with pixelkit, in the
manner of godot-sandbox's research and build icons (near-black outline, flat colour, a dark and a
light shade, dither, a ground shadow). Writes public/art/buildings/pixel/<id>.png.

    python3 tools/art/draw_pixel_buildings.py
"""
import os

from pixelkit import Canvas

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "art", "buildings", "pixel"))


def farm():
    """Hydroponic Farm: a glass vault over rows of crops, with a water tower beside it."""
    c = Canvas()
    c.shadow(31, 55, 27, 5)
    # water tower behind, at the right
    c.rect(49, 30, 2, 20, "line")
    c.rect(55, 30, 2, 20, "line")
    c.line(49, 34, 56, 44, "line")
    c.ellipse(52.5, 24, 7, 9, "sky")
    c.rect(47, 15, 12, 4, "sky")
    c.ellipse(52.5, 15, 6, 2.5, "glass")
    c.dither(48, 22, 4, 8, "glass", 0)
    c.rect(56, 20, 2, 10, "blue")
    # the vault: back end, roof band, front end
    c.dome(31, 39, 17, 17, "glass")
    c.poly([(8, 39), (12, 30), (18, 25), (26, 22), (32, 22), (38, 23), (31, 21), (24, 20), (16, 23), (10, 28)], "glass", None)
    c.dome(24, 41, 17, 17, "glass", light="white")
    # crops behind the glass
    for row, (y, cc) in enumerate(((30, "jade"), (34, "lime"), (38, "jade"))):
        for x in range(10 + row, 40 - row, 2):
            c.set(x, y, cc)
            c.set(x, y - 1, "green" if (x // 2) % 2 else cc)
    # ribs and frame
    for x in (12, 18, 24, 30, 36):
        for y in range(24, 40):
            if c.get(x, y)[:3] != (0, 0, 0) and c.get(x, y)[3]:
                c.set(x, y, "steel_l")
    # base
    c.obox(6, 39, 36, 11, 8, "steel_d", "steel", "dark")
    c.rect(8, 42, 32, 2, "steel")
    for x in range(9, 40, 6):
        c.rect(x, 45, 3, 3, "lime")
    return c


def mine():
    """Deep Mine: a headframe tower with its wheel over the shaft, an ore cart and rock."""
    c = Canvas()
    c.shadow(32, 55, 27, 5)
    # rock pile
    c.poly([(4, 52), (10, 41), (17, 38), (24, 44), (26, 52)], "slate")
    c.dither(10, 43, 8, 6, "brown", 0)
    c.poly([(40, 52), (46, 44), (54, 43), (60, 52)], "slate")
    c.dither(47, 46, 8, 4, "brown", 1)
    # headframe: two legs and a brace, the wheel at the top
    c.line(20, 50, 30, 10, "line", 1)
    c.line(21, 50, 31, 10, "rust", 1)
    c.line(44, 50, 34, 10, "line", 1)
    c.line(43, 50, 33, 10, "rust", 1)
    for y in (22, 34, 44):
        c.line(23 + (50 - y) // 5, y, 41 - (50 - y) // 5, y, "line")
    c.line(25, 44, 39, 22, "rust")
    c.line(39, 44, 25, 22, "rust")
    c.ellipse(32, 12, 7, 7, "steel")
    c.ellipse(32, 12, 4, 4, "dark")
    c.line(25, 12, 39, 12, "line")
    c.line(32, 5, 32, 19, "line")
    c.line(32, 12, 32, 40, "steel_l")
    # shaft house
    c.obox(22, 40, 18, 11, 6, "red_d", "rust", "brown_d")
    c.rect(28, 43, 6, 8, "coal")
    c.rect(28, 43, 6, 1, "orange")
    # ore cart
    c.poly([(42, 48), (56, 48), (54, 54), (44, 54)], "steel_d")
    c.rect(44, 46, 10, 2, "orange")
    c.dither(44, 45, 10, 2, "amber", 0)
    c.ellipse(46, 55, 2, 2, "dark")
    c.ellipse(53, 55, 2, 2, "dark")
    return c


def manufactory():
    """Manufactory: a sawtooth-roofed works with two smoking stacks and crates of goods."""
    c = Canvas()
    c.shadow(32, 55, 28, 5)
    # smoke
    for (x, y, r) in ((47, 8, 4), (52, 5, 3), (40, 11, 3), (44, 4, 2)):
        c.ellipse(x, y, r, r, "silver", None)
        c.dither(x - r + 1, y, r, r, "white", 0)
    # stacks
    c.obox(43, 14, 5, 22, 3, "red_d", "coal", "plum")
    c.rect(43, 17, 6, 2, "white")
    c.obox(35, 18, 5, 18, 3, "red_d", "coal", "plum")
    c.rect(35, 21, 6, 2, "white")
    # the works
    c.obox(5, 33, 44, 18, 8, "brown", "rust", "brown_d")
    # sawtooth roof on top: teeth of glass
    for i in range(4):
        x = 7 + i * 11
        c.poly([(x, 33), (x + 4, 26), (x + 11, 29), (x + 11, 33)], "rust")
        c.poly([(x + 4, 26), (x + 5, 26), (x + 5, 33), (x, 33)], "glass")
    c.rect(8, 37, 38, 1, "brown_d")
    c.window_row(9, 40, 6, 6, c="amber", dark="orange", w=3, h=4)
    c.rect(20, 45, 10, 6, "coal")
    c.dither(21, 46, 8, 4, "dark", 0)
    # crates
    c.obox(51, 44, 7, 7, 3, "gold_d", "gold", "brown_d")
    c.obox(53, 38, 5, 6, 3, "orange", "gold_l", "gold_d")
    c.line(52, 46, 57, 50, "brown_d")
    return c


def trade_hub():
    """Trade Hub: a domed exchange with a landing pad, a beacon mast and a big credit sign."""
    c = Canvas()
    c.shadow(32, 55, 28, 5)
    # landing pad at the left
    c.ellipse(13, 49, 10, 4, "dark")
    c.ellipse(13, 49, 6, 2, "dark_d")
    c.set(13, 49, "yellow")
    c.set(5, 49, "yellow")
    c.set(21, 49, "yellow")
    # the hall
    c.obox(16, 37, 32, 14, 6, "steel", "steel_l", "steel_d")
    c.window_row(19, 41, 7, 4, c="glass", dark="cyan_d", w=2, h=5)
    c.rect(29, 44, 6, 7, "dark")
    c.rect(29, 44, 6, 1, "amber")
    # the dome
    c.dome(35, 35, 13, 10, "gold", shade="gold_d", light="gold_l")
    c.line(35, 26, 35, 34, "gold_d")
    c.line(29, 27, 27, 34, "gold_d")
    # beacon mast and a credit coin sign
    c.line(35, 26, 35, 10, "line")
    c.ellipse(35, 9, 2, 2, "red")
    c.ellipse(51, 20, 8, 8, "amber")
    c.ellipse(51, 20, 6, 6, "gold")
    c.rect(49, 15, 4, 10, "gold_d")
    c.rect(50, 16, 2, 8, "yellow")
    c.line(51, 28, 51, 37, "line")
    return c


def shipyard():
    """Orbital Shipyard: a gantry frame cradling a hull, with a crane and work lights."""
    c = Canvas()
    c.shadow(32, 55, 29, 5)
    # gantry towers
    for x in (6, 52):
        c.rect(x, 12, 6, 40, "line")
        c.rect(x + 1, 13, 4, 38, "orange")
        for y in range(15, 50, 6):
            c.line(x + 1, y, x + 4, y + 4, "line")
    c.rect(6, 10, 52, 4, "line")
    c.rect(7, 11, 50, 2, "amber")
    # the hull in the cradle
    c.poly([(14, 36), (40, 30), (54, 34), (40, 40), (14, 40)], "steel")
    c.poly([(14, 36), (40, 30), (40, 34), (14, 38)], "steel_l", None)
    c.poly([(14, 40), (40, 40), (54, 34)], "steel_d", None)
    c.line(14, 36, 40, 30, "line")
    c.line(40, 30, 54, 34, "line")
    c.line(54, 34, 40, 40, "line")
    c.line(40, 40, 14, 40, "line")
    c.line(14, 36, 14, 40, "line")
    c.rect(11, 35, 4, 6, "dark")
    c.set(10, 37, "cyan")
    c.set(10, 38, "cyan")
    c.window_row(20, 36, 5, 4, c="glass", dark="cyan_d", w=2, h=1)
    # cradle arms
    for x in (20, 32, 44):
        c.line(x, 40, x, 50, "dark")
        c.line(x + 1, 40, x + 1, 50, "steel_d")
    c.rect(12, 49, 40, 3, "dark")
    # crane: a hook on a cable from the top beam, and sparks of welding
    c.line(26, 13, 26, 26, "line")
    c.rect(24, 26, 5, 2, "yellow")
    for (x, y) in ((37, 28), (39, 27), (36, 26), (38, 25)):
        c.set(x, y, "yellow")
    c.set(37, 27, "white")
    return c


def lab():
    """Research Lab: a dome with a telescope slit, a sensor dish, and a glowing flask on the sign."""
    c = Canvas()
    c.shadow(32, 55, 27, 5)
    c.obox(10, 38, 34, 13, 7, "white", "silver", "steel")
    c.window_row(13, 42, 6, 5, c="cyan", dark="cyan_d", w=3, h=3)
    c.rect(36, 44, 5, 7, "steel_b")
    # dome with the slit
    c.dome(27, 36, 15, 13, "silver", shade="steel", light="white")
    c.poly([(25, 24), (29, 24), (30, 36), (24, 36)], "deep")
    # telescope peeking out
    c.poly([(26, 26), (34, 15), (37, 17), (29, 28)], "steel_d")
    c.ellipse(35.5, 15.5, 2.5, 2, "glass")
    # dish on the roof at the right
    c.line(47, 33, 47, 26, "line")
    c.ellipse(48, 23, 7, 4, "steel_l")
    c.ellipse(48, 23, 3, 2, "steel")
    c.line(48, 23, 53, 18, "line")
    c.set(53, 18, "red")
    # flask sign
    c.poly([(55, 38), (58, 38), (58, 42), (61, 48), (52, 48), (55, 42)], "mint")
    c.rect(53, 44, 7, 4, "lime")
    c.dither(54, 45, 5, 2, "white", 0)
    return c


def warehouse():
    """Warehouse: a long shed with ribbed walls, roll-up doors and crates stacked outside."""
    c = Canvas()
    c.shadow(31, 55, 28, 5)
    c.obox(4, 30, 42, 21, 12, "steel_d", "steel", "dark")
    # ribbed wall
    for x in range(6, 45, 3):
        c.line(x, 31, x, 50, "steel")
    # curved roof lip
    c.rect(4, 29, 43, 2, "steel_l")
    c.line(4, 29, 46, 29, "line")
    # roll-up doors
    for x in (9, 26):
        c.rect(x, 38, 12, 13, "line")
        for y in range(39, 51, 2):
            c.rect(x + 1, y, 10, 1, "silver")
        c.rect(x + 1, 38, 10, 1, "amber")
    c.rect(22, 34, 2, 2, "amber")
    # stencil number
    c.rect(8, 33, 2, 3, "yellow")
    c.rect(11, 33, 2, 3, "yellow")
    # crates and a barrel
    c.obox(47, 44, 7, 7, 4, "brown", "sand", "brown_d")
    c.line(47, 44, 54, 51, "brown_d")
    c.obox(49, 37, 6, 7, 3, "jade", "mint", "green_d")
    c.ellipse(59, 48, 3, 4, "red")
    c.line(56, 47, 62, 47, "red_d")
    return c


def temple():
    """Temple: a stepped shrine with a glowing round window, a spire and banners."""
    c = Canvas()
    c.shadow(32, 55, 27, 5)
    c.obox(8, 44, 44, 7, 6, "sand", "white", "brown")
    c.obox(13, 34, 34, 10, 6, "white", "sand", "brown")
    c.obox(19, 24, 22, 10, 5, "white", "sand", "brown")
    # spire
    c.poly([(26, 24), (34, 24), (31, 4), (29, 4)], "gold")
    c.line(31, 4, 33, 24, "gold_d")
    c.ellipse(30, 3, 2, 2, "yellow")
    # round window glowing
    c.ellipse(30, 30, 4, 4, "pink")
    c.ellipse(30, 30, 2, 2, "white")
    # door and steps
    c.rect(26, 37, 8, 7, "plum")
    c.rect(27, 38, 6, 1, "pink")
    for i in range(3):
        c.rect(24 - i, 51 - i * 2, 12 + i * 2, 1, "slate")
    # banners
    for x in (15, 43):
        c.line(x, 34, x, 22, "line")
        c.poly([(x, 22), (x + 4, 23), (x + 3, 27), (x + 4, 31), (x, 30)], "purple")
    c.dither(10, 45, 40, 5, "sand", 0)
    return c


def capitol():
    """Capitol: a great domed hall of columns with the empire's flag flying over it."""
    c = Canvas()
    c.shadow(32, 55, 29, 5)
    # steps
    c.obox(4, 46, 50, 5, 6, "silver", "white", "steel")
    # the hall and its columns
    c.obox(8, 32, 42, 14, 6, "white", "silver", "steel")
    for x in range(10, 49, 5):
        c.rect(x, 33, 3, 13, "silver")
        c.rect(x, 33, 1, 13, "white")
        c.rect(x + 2, 33, 1, 13, "steel")
    # pediment
    c.poly([(7, 32), (51, 32), (29, 22)], "white")
    c.poly([(13, 30), (45, 30), (29, 25)], "silver", None)
    # dome on a drum
    c.rect(19, 15, 22, 8, "silver")
    c.line(19, 15, 19, 22, "line")
    c.line(40, 15, 40, 22, "line")
    for x in range(21, 40, 3):
        c.rect(x, 17, 1, 4, "steel")
    c.dome(29.5, 15, 12, 10, "gold", shade="gold_d", light="gold_l")
    c.rect(17, 15, 25, 2, "silver")
    c.line(17, 14, 42, 14, "line")
    # flag
    c.line(29, 5, 29, 0, "line")
    c.poly([(30, 0), (38, 1), (36, 3), (38, 5), (30, 5)], "red")
    return c


BUILDINGS = {
    "farm": farm, "mine": mine, "manufactory": manufactory, "trade-hub": trade_hub,
    "shipyard": shipyard, "lab": lab, "warehouse": warehouse, "temple": temple, "capitol": capitol,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in BUILDINGS.items():
        fn().save(os.path.join(OUT, f"{name}.png"))
    print("wrote", len(BUILDINGS), "pixel buildings to", os.path.relpath(OUT))


if __name__ == "__main__":
    main()
