#!/usr/bin/env python3
"""Author the Material Maker (.ptex) graphs Falchion's ship hulls are textured with.

One graph per ship style (technological, utilitarian, organic, geometric, classic) and one
shared machinery graph for detail parts. Material Maker renders them (the material-maker-headless
skill runs it with no GPU) and tools/materials/postprocess.py packs the maps into the small
textures in public/textures/ships/ that ShipKit maps onto every hull (the ship-materials skill).

Provenance: the Graph helper, its wrappers and constants are Star Crew Bridge Simulator's
tools/materials/build_ptex.py (db2b3d4), itself from fps-game-demo f6cd25c, unchanged. The graphs
are Falchion's own.

Run:  python3 tools/materials/build_ptex.py
Then: bash tools/materials/export_materials.sh
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "ptex")

# Material inputs on the "material" node (Material Maker's static PBR output).
ALBEDO, METALLIC, ROUGHNESS, EMISSION, NORMAL, AO, DEPTH = range(7)


def rgb(r, g, b, a=1.0):
    return {"r": r, "g": g, "b": b, "a": a, "type": "Color"}


def hexc(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def grad(*stops, interpolation=1):
    """stops: (pos, '#rrggbb') or (pos, (r, g, b)) or (pos, grey_float)."""
    pts = []
    for pos, c in stops:
        if isinstance(c, str):
            c = hexc(c)
        elif isinstance(c, (int, float)):
            c = (c, c, c)
        pts.append({"pos": pos, "r": c[0], "g": c[1], "b": c[2], "a": 1})
    return {"interpolation": interpolation, "points": pts, "type": "Gradient"}


def curve(*pts):
    """Tonality curve points: (x, y) pairs, linear tangents."""
    out = []
    for i, (x, y) in enumerate(pts):
        out.append({"x": x, "y": y, "ls": 0.0, "rs": 0.0})
    # compute simple slopes
    for i in range(len(out)):
        if i > 0:
            dx = out[i]["x"] - out[i - 1]["x"]
            out[i]["ls"] = (out[i]["y"] - out[i - 1]["y"]) / dx if dx else 0
        if i < len(out) - 1:
            dx = out[i + 1]["x"] - out[i]["x"]
            out[i]["rs"] = (out[i + 1]["y"] - out[i]["y"]) / dx if dx else 0
    return {"points": out, "type": "Curve"}


class Graph:
    def __init__(self, label):
        self.label = label
        self.nodes = []
        self.conns = []
        self.counter = {}
        self.col = 0

    def node(self, type_, *inputs, name=None, **params):
        """Create a node. inputs: sequence of (node_name, port) or node_name (port 0) or None."""
        idx = self.counter.get(type_, 0)
        self.counter[type_] = idx + 1
        name = name or f"{type_}_{idx}"
        self.col += 1
        n = {
            "name": name,
            "type": type_,
            "node_position": {"x": 220 * (self.col % 8), "y": 160 * (self.col // 8)},
            "parameters": params,
        }
        self.nodes.append(n)
        for port, src in enumerate(inputs):
            if src is None:
                continue
            self.link(src, name, port)
        return name

    def link(self, src, dst, dst_port):
        if isinstance(src, tuple):
            s, sp = src
        else:
            s, sp = src, 0
        self.conns.append({"from": s, "from_port": sp, "to": dst, "to_port": dst_port})

    def material(self, albedo=None, metallic=None, roughness=None, emission=None,
                 normal=None, ao=None, depth=None, metallic_v=1.0, roughness_v=1.0,
                 emission_energy=1.0, normal_v=1.0, ao_v=1.0):
        name = self.node(
            "material", name="Material",
            albedo_color=rgb(1, 1, 1), metallic=metallic_v, roughness=roughness_v,
            emission_energy=emission_energy, normal=normal_v, ao=ao_v,
            depth_scale=0.0, flags_transparent=False, sss=0.0, size=11)
        self.nodes[-1]["export_paths"] = {}
        for port, src in ((ALBEDO, albedo), (METALLIC, metallic), (ROUGHNESS, roughness),
                          (EMISSION, emission), (NORMAL, normal), (AO, ao), (DEPTH, depth)):
            if src is not None:
                self.link(src, name, port)
        return name

    # --- convenience wrappers -------------------------------------------------
    def colorize(self, src, gradient):
        return self.node("colorize", src, gradient=gradient)

    def blend(self, top, bottom, mask=None, mode=0, amount=1.0):
        # Material Maker blend: s1 (top) over s2 (bottom) using mask * amount.
        return self.node("blend", top, bottom, mask, blend_type=mode, amount=amount)

    def math(self, a, b=None, op=0, in1=0.0, in2=0.0, clamp=False):
        return self.node("math", a, b, op=op, default_in1=in1, default_in2=in2, clamp=clamp)

    def normal_map(self, height, strength=1.0):
        return self.node("normal_map", height, param0=11, param1=strength, param2=0, param4=1)

    def occlusion(self, height, strength=1.5, radius=20):
        return self.node("occlusion2", height, param0=11, param1=radius, param2=strength, param3=1)

    def tone(self, src, *pts):
        return self.node("tonality", src, curve=curve(*pts))

    def grey(self, v):
        return self.node("uniform_greyscale", color=v)

    def color(self, c):
        if isinstance(c, str):
            c = hexc(c)
        return self.node("uniform", color=rgb(*c))

    def to_json(self):
        return {
            "name": "Material", "label": self.label, "type": "graph",
            "node_position": {"x": 0, "y": 0},
            "parameters": {}, "connections": self.conns, "nodes": self.nodes,
        }


# Math op indices (see Material Maker math node)
ADD, SUB, MUL, DIV = 0, 1, 2, 3
POW, ABS = 6, 7
MIN, MAX = 13, 14
LT = 15
SMOOTH = 20

# Blend modes
NORMAL_B, DISSOLVE, MULTIPLY, SCREEN, OVERLAY, HARD_LIGHT, SOFT_LIGHT = range(7)
BURN, DODGE, LIGHTEN, DARKEN, DIFFERENCE, ADDITIVE = range(7, 13)



# ----------------------------------------------------------------------------
# Ship hulls. Albedo stays near neutral grey: ShipKit multiplies it by the design's colour, so a
# graph sets light and dark (paint, panel lines, grime), never hue. Emission marks lit windows and
# glowing seams; ShipKit colours it with the design's accent.
# ----------------------------------------------------------------------------

def _finish(g, albedo, height, emission=None, rough=None, metallic_v=0.5, normal_strength=1.2, ao_strength=1.2):
    normal = g.normal_map(height, strength=normal_strength)
    ao = g.occlusion(height, strength=ao_strength, radius=10)
    g.material(albedo=albedo, roughness=rough, emission=emission, normal=normal, ao=ao, metallic_v=metallic_v,
               roughness_v=0.5 if rough is None else 1.0)
    return g


def hull_technological():
    """Engineered plating: uneven rectangular panels, recessed seams, a few panels with rows of lit windows."""
    g = Graph("Hull Technological")
    panels = g.node("bricks_uneven", iterations=6, min_size=0.08, randomness=0.55, mortar=0.005, bevel=0.008, round=0.0, corner=0.0)
    tint = g.node("greyscale", (panels, 1), mode=2)
    fine = g.node("fbm2", noise=0, scale_x=32, scale_y=32, folds=0, iterations=4, persistence=0.5, offset=0.3)
    grime_n = g.node("fbm2", noise=2, scale_x=6, scale_y=6, folds=0, iterations=6, persistence=0.55, offset=0.1)
    # windows: a fine grid of small slots, only on some panels, only on a band through each
    slots = g.node("bricks", pattern=0, repeat=1, rows=64, columns=32, row_offset=0.0, mortar=0.25, bevel=0.0, round=0.0, corner=0.0)
    slots_m = g.tone(slots, (0, 0), (0.05, 1), (1, 1))
    rows = g.node("bricks", pattern=0, repeat=1, rows=16, columns=1, row_offset=0.0, mortar=0.3, bevel=0.0, round=0.0, corner=0.0)
    rows_m = g.math(g.grey(1), g.tone(rows, (0, 0), (0.05, 1), (1, 1)), op=SUB, clamp=True)
    lit_panels = g.tone(tint, (0, 0), (0.6, 0), (0.62, 1), (1, 1))
    windows = g.math(g.math(slots_m, rows_m, op=MUL), lit_panels, op=MUL, clamp=True)
    paint = g.colorize(tint, grad((0, 0.62), (1, 0.82)))
    grime = g.colorize(grime_n, grad((0, 0.55), (1, 1.0)))
    albedo_a = g.blend(grime, paint, None, mode=MULTIPLY, amount=0.5)
    seams = g.tone(panels, (0, 0.25), (0.08, 1), (1, 1))
    albedo_b = g.blend(seams, albedo_a, None, mode=MULTIPLY, amount=1.0)
    albedo = g.blend(g.color("#202428"), albedo_b, windows, mode=NORMAL_B, amount=1.0)
    height = g.math(g.math(panels, None, op=MUL, in2=0.8), g.math(fine, None, op=MUL, in2=0.03), op=ADD)
    height = g.math(height, g.math(windows, None, op=MUL, in2=0.25), op=SUB, clamp=True)
    emission = g.blend(g.color("#ffffff"), g.color("#000000"), windows, mode=NORMAL_B, amount=1.0)
    rough = g.math(g.colorize(grime_n, grad((0, 0.35), (1, 0.6))), None, op=ADD, in2=0.0)
    return _finish(g, albedo, height, emission, rough, metallic_v=0.6)


def hull_utilitarian():
    """Big riveted plates, weld seams, rows of rivets, grime streaks and patches of bare metal."""
    g = Graph("Hull Utilitarian")
    plates = g.node("bricks", pattern=0, repeat=1, rows=4, columns=2, row_offset=0.5, mortar=0.012, bevel=0.03, round=0.0, corner=0.0)
    tint = g.node("greyscale", (plates, 1), mode=2)
    rivet_c = g.node("sdcircle", r=0.004, cx=0, cy=0)
    rivets_all = g.node("sdrepeat", rivet_c, rx=48, ry=48, r=0.0, variations=False)
    rivets_s = g.node("sdshow", rivets_all, bevel=0.003, base=0.0)
    near_seam = g.tone(plates, (0, 1), (0.25, 1), (0.35, 0), (1, 0))
    rivets = g.math(rivets_s, near_seam, op=MUL, clamp=True)
    streak = g.node("fbm2", noise=1, scale_x=3, scale_y=40, folds=0, iterations=5, persistence=0.6, offset=0.2)
    grime_n = g.node("fbm2", noise=2, scale_x=5, scale_y=5, folds=0, iterations=7, persistence=0.6, offset=0.4)
    wear = g.tone(grime_n, (0, 0), (0.66, 0), (0.8, 0.5), (1, 0.5))
    paint = g.colorize(tint, grad((0, 0.5), (1, 0.8)))
    bare = g.colorize(grime_n, grad((0, 0.7), (1, 0.85)))
    col = g.blend(bare, paint, wear, mode=NORMAL_B, amount=0.8)
    streaks = g.colorize(streak, grad((0, 0.6), (1, 1.0)))
    col2 = g.blend(streaks, col, None, mode=MULTIPLY, amount=0.6)
    seams = g.tone(plates, (0, 0.2), (0.06, 1), (1, 1))
    albedo_s = g.blend(seams, col2, None, mode=MULTIPLY, amount=1.0)
    albedo = g.blend(g.color("#d8d8d8"), albedo_s, rivets, mode=NORMAL_B, amount=0.6)
    height = g.math(g.math(plates, None, op=MUL, in2=0.7), g.math(rivets, None, op=MUL, in2=0.2), op=ADD)
    height = g.math(height, g.math(wear, None, op=MUL, in2=0.03), op=SUB, clamp=True)
    rough = g.math(g.colorize(grime_n, grad((0, 0.55), (1, 0.85))), g.math(wear, None, op=MUL, in2=0.3), op=SUB, clamp=True)
    return _finish(g, albedo, height, None, rough, metallic_v=0.5, normal_strength=1.4)


def hull_organic():
    """Chitin: overlapping scales with grooved borders, leathery mottling, faint glowing veins."""
    g = Graph("Hull Organic")
    scales = g.node("voronoi", scale_x=10, scale_y=14, stretch_x=1, stretch_y=1.4, intensity=0.85, randomness=0.9)
    cell = g.tone((scales, 0), (0, 1), (1, 0))
    dome = g.tone(cell, (0, 0), (0.6, 0.85), (1, 1))
    border = g.tone((scales, 1), (0, 1), (0.08, 0), (1, 0))
    mottle = g.node("fbm2", noise=2, scale_x=8, scale_y=8, folds=0, iterations=7, persistence=0.6, offset=0.3)
    vein_v = g.node("voronoi", scale_x=3, scale_y=4, stretch_x=1, stretch_y=1.3, intensity=1.0, randomness=1.0)
    vein_w = g.node("warp", (vein_v, 1), mottle, mode=0, amount=0.08, eps=0.05)
    veins = g.tone(vein_w, (0, 1), (0.04, 0), (1, 0))
    tint = g.node("greyscale", (scales, 2), mode=2)
    skin = g.colorize(tint, grad((0, 0.6), (1, 0.82)))
    skin2 = g.blend(g.colorize(mottle, grad((0, 0.55), (1, 1.0))), skin, None, mode=MULTIPLY, amount=0.7)
    albedo_a = g.blend(g.color("#2a2622"), skin2, border, mode=NORMAL_B, amount=0.85)
    albedo = g.blend(g.color("#9a9a9a"), albedo_a, veins, mode=NORMAL_B, amount=0.5)
    height = g.math(g.math(dome, None, op=MUL, in2=0.8), g.math(border, None, op=MUL, in2=0.35), op=SUB, clamp=True)
    height = g.math(height, g.math(mottle, None, op=MUL, in2=0.06), op=ADD)
    emission = g.blend(g.color("#ffffff"), g.color("#000000"), g.math(veins, None, op=MUL, in2=0.6), mode=NORMAL_B, amount=1.0)
    rough = g.colorize(mottle, grad((0, 0.25), (1, 0.55)))
    return _finish(g, albedo, height, emission, rough, metallic_v=0.1, normal_strength=1.6, ao_strength=1.5)


def hull_geometric():
    """Crystal facets, each its own shade, cut by thin glowing seams like circuitry."""
    g = Graph("Hull Geometric")
    facets = g.node("voronoi", scale_x=5, scale_y=5, stretch_x=1, stretch_y=1, intensity=1.0, randomness=1.0)
    shade = g.node("greyscale", (facets, 2), mode=2)
    circuit = g.node("bricks_uneven", iterations=7, min_size=0.05, randomness=0.7, mortar=0.004, bevel=0.0, round=0.0, corner=0.0)
    seams = g.tone((facets, 1), (0, 1), (0.03, 0), (1, 0))
    lines = g.tone(circuit, (0, 1), (0.02, 0), (1, 0))
    lit_cells = g.tone(g.node("greyscale", (circuit, 1), mode=2), (0, 0), (0.7, 0), (0.72, 1), (1, 1))
    glow = g.math(lines, lit_cells, op=MUL, clamp=True)
    fine = g.node("fbm2", noise=0, scale_x=24, scale_y=24, folds=0, iterations=3, persistence=0.5, offset=0.5)
    face = g.colorize(shade, grad((0, 0.55), (0.5, 0.75), (1, 0.95)))
    albedo_a = g.blend(g.colorize(fine, grad((0, 0.9), (1, 1.0))), face, None, mode=MULTIPLY, amount=1.0)
    albedo_g = g.blend(g.color("#3a3f46"), albedo_a, seams, mode=NORMAL_B, amount=0.8)
    albedo = g.blend(g.color("#e8eef4"), albedo_g, glow, mode=NORMAL_B, amount=1.0)
    height = g.math(g.colorize(shade, grad((0, 0.4), (1, 0.8))), g.math(seams, None, op=MUL, in2=0.3), op=SUB, clamp=True)
    emission = g.blend(g.color("#ffffff"), g.color("#000000"), glow, mode=NORMAL_B, amount=1.0)
    return _finish(g, albedo, height, emission, None, metallic_v=0.7, normal_strength=1.0, ao_strength=0.8)


def hull_classic():
    """Smooth enamel with long panel lines, gentle sheen, and rows of round portholes."""
    g = Graph("Hull Classic")
    panels = g.node("bricks", pattern=0, repeat=1, rows=3, columns=1, row_offset=0.0, mortar=0.004, bevel=0.01, round=0.0, corner=0.0)
    seams2 = g.node("bricks", pattern=0, repeat=1, rows=1, columns=3, row_offset=0.0, mortar=0.003, bevel=0.0, round=0.0, corner=0.0)
    port_c = g.node("sdcircle", r=0.007, cx=0, cy=0)
    ports_all = g.node("sdrepeat", port_c, rx=32, ry=8, r=0.0, variations=False)
    ports_s = g.node("sdshow", ports_all, bevel=0.002, base=0.0)
    band = g.node("pattern", mix=0, x_wave=4, x_scale=0, y_wave=2, y_scale=3)
    band_t = g.tone(band, (0, 0), (0.93, 0), (0.95, 1), (1, 1))
    ports = g.math(ports_s, band_t, op=MUL, clamp=True)
    sheen = g.node("fbm2", noise=2, scale_x=3, scale_y=3, folds=0, iterations=5, persistence=0.45, offset=0.6)
    lines = g.math(g.tone(panels, (0, 0.25), (0.08, 1), (1, 1)), g.tone(seams2, (0, 0.4), (0.08, 1), (1, 1)), op=MUL)
    enamel = g.colorize(sheen, grad((0, 0.82), (1, 0.95)))
    albedo_a = g.blend(lines, enamel, None, mode=MULTIPLY, amount=1.0)
    albedo = g.blend(g.color("#1c2026"), albedo_a, ports, mode=NORMAL_B, amount=1.0)
    height = g.math(g.math(lines, None, op=MUL, in2=0.5), g.math(ports, None, op=MUL, in2=0.25), op=SUB, clamp=True)
    emission = g.blend(g.color("#ffffff"), g.color("#000000"), ports, mode=NORMAL_B, amount=1.0)
    rough = g.colorize(sheen, grad((0, 0.18), (1, 0.32)))
    return _finish(g, albedo, height, emission, rough, metallic_v=0.75, normal_strength=0.8, ao_strength=0.8)


def hull_machinery():
    """Detail parts on every style: dense greebles (small blocks of uneven heights), pipes and vents."""
    g = Graph("Hull Machinery")
    blocks = g.node("bricks_uneven", iterations=8, min_size=0.03, randomness=0.8, mortar=0.01, bevel=0.04, round=0.0, corner=0.0)
    heights = g.node("greyscale", (blocks, 1), mode=2)
    vent = g.node("bricks", pattern=0, repeat=1, rows=40, columns=1, row_offset=0.0, mortar=0.4, bevel=0.0, round=0.0, corner=0.0)
    vent_cells = g.tone(heights, (0, 0), (0.15, 0), (0.17, 1), (0.3, 1), (0.32, 0), (1, 0))
    vents = g.math(g.tone(vent, (0, 1), (0.5, 0), (1, 0)), vent_cells, op=MUL, clamp=True)
    grime_n = g.node("fbm2", noise=2, scale_x=8, scale_y=8, folds=0, iterations=6, persistence=0.6, offset=0.8)
    h = g.math(blocks, g.colorize(heights, grad((0, 0.3), (1, 1.0))), op=MUL)
    height = g.math(h, g.math(vents, None, op=MUL, in2=0.3), op=SUB, clamp=True)
    tone = g.colorize(heights, grad((0, 0.45), (1, 0.75)))
    col = g.blend(g.colorize(grime_n, grad((0, 0.6), (1, 1.0))), tone, None, mode=MULTIPLY, amount=0.6)
    albedo = g.blend(g.tone(blocks, (0, 0.2), (0.1, 1), (1, 1)), col, None, mode=MULTIPLY, amount=1.0)
    rough = g.colorize(grime_n, grad((0, 0.4), (1, 0.7)))
    return _finish(g, albedo, height, None, rough, metallic_v=0.7, normal_strength=1.6, ao_strength=1.6)


GRAPHS = {
    "hull_technological": hull_technological,
    "hull_utilitarian": hull_utilitarian,
    "hull_organic": hull_organic,
    "hull_geometric": hull_geometric,
    "hull_classic": hull_classic,
    "hull_machinery": hull_machinery,
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, fn in GRAPHS.items():
        path = os.path.join(OUT_DIR, name + ".ptex")
        with open(path, "w") as f:
            json.dump(fn().to_json(), f, indent=1, sort_keys=True)
        print("wrote", os.path.relpath(path))


if __name__ == "__main__":
    main()
