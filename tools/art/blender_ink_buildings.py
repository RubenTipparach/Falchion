#!/usr/bin/env python3
"""Falchion's buildings in ink: modelled from primitives in Blender (bpy), cel-shaded flat in
three tones and outlined with Freestyle ink, like a comic panel. Rendered at 512 px with Cycles on
the CPU (no GPU needed), then shrunk to 128 with a soft ground shadow. Writes
public/art/buildings/ink/<id>.png. The hand-drawn-art skill says how to set Blender up.

    /tmp/bpyenv/bin/python tools/art/blender_ink_buildings.py      # pip install bpy==4.5.* pillow
"""
import math
import os
import sys

import bpy
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "art", "buildings", "ink"))
RAW = int(os.environ.get("INK_RAW", 512))
SIZE = 128
INK = (0.03, 0.025, 0.05)
# The cel light: from the upper left, in front of the camera.
LIGHT = (-0.55, -0.45, 0.70)

C = {
    "steel": (0.58, 0.63, 0.72), "steel_d": (0.36, 0.40, 0.48), "white": (0.93, 0.92, 0.88),
    "glass": (0.55, 0.88, 1.0), "gold": (0.96, 0.70, 0.18), "rust": (0.74, 0.36, 0.26),
    "brick": (0.68, 0.40, 0.31), "green": (0.30, 0.78, 0.34), "lime": (0.66, 0.92, 0.30),
    "sky": (0.26, 0.62, 0.94), "red": (0.90, 0.24, 0.27), "purple": (0.58, 0.43, 0.86),
    "sand": (0.90, 0.79, 0.54), "dark": (0.22, 0.24, 0.30), "amber": (1.0, 0.76, 0.24),
    "rock": (0.48, 0.43, 0.41), "pink": (1.0, 0.55, 0.72), "orange": (0.95, 0.58, 0.15),
}
_mats = {}


def srgb_to_linear(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def toon(name, glow=False, alpha=1.0):
    """A flat cel material: three tones (shade, base, light) picked by the normal against LIGHT,
    emitted so no lamp is needed. `glow` makes it one bright tone (windows, lamps)."""
    key = (name, glow, alpha)
    if key in _mats:
        return _mats[key]
    base = srgb_to_linear(C[name])
    m = bpy.data.materials.new(f"{name}{'-glow' if glow else ''}")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(em.outputs[0], out.inputs[0])
    if glow:
        em.inputs["Color"].default_value = (*[min(1, v * 1.25) for v in base], 1)
        em.inputs["Strength"].default_value = 1.0
    else:
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        dot = nt.nodes.new("ShaderNodeVectorMath")
        dot.operation = "DOT_PRODUCT"
        n = math.sqrt(sum(v * v for v in LIGHT))
        dot.inputs[1].default_value = tuple(v / n for v in LIGHT)
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.interpolation = "CONSTANT"
        els = ramp.color_ramp.elements
        shade = tuple(v * 0.42 for v in base)
        light = tuple(min(1, v * 1.35 + 0.04) for v in base)
        els[0].position, els[0].color = 0.0, (*shade, 1)
        els[1].position, els[1].color = 0.12, (*base, 1)
        e = els.new(0.72)
        e.color = (*light, 1)
        nt.links.new(geo.outputs["Normal"], dot.inputs[0])
        nt.links.new(dot.outputs["Value"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    if alpha < 1:
        # see-through (the farm's glass vault): mix with a transparent shader
        mix = nt.nodes.new("ShaderNodeMixShader")
        clear = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix.inputs["Fac"].default_value = alpha
        nt.links.new(clear.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
    _mats[key] = m
    return m


def _finish(obj, color, glow=False, smooth=False, alpha=1.0):
    obj.data.materials.append(toon(color, glow, alpha))
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def box(x, y, z, sx, sy, sz, color, glow=False, rot=0.0):
    """A box with its base centred on (x, y, z), sx by sy by sz."""
    bpy.ops.mesh.primitive_cube_add(location=(x, y, z + sz / 2), rotation=(0, 0, rot))
    o = bpy.context.object
    o.scale = (sx / 2, sy / 2, sz / 2)
    return _finish(o, color, glow)


def cyl(x, y, z, r, h, color, verts=24, glow=False, rot=(0, 0, 0), r2=None):
    """A cylinder (a cone when r2 is given) standing on (x, y, z)."""
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(x, y, z + h / 2), rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=(x, y, z + h / 2), rotation=rot)
    return _finish(bpy.context.object, color, glow, smooth=True)


def ball(x, y, z, r, color, sz=None, glow=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r, location=(x, y, z))
    o = bpy.context.object
    if sz:
        o.scale = (1, 1, sz / r)
    return _finish(o, color, glow, smooth=True)


def dome(x, y, z, r, color, h=None, glow=False, alpha=1.0):
    """The top half of a sphere sitting on (x, y, z)."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r, location=(x, y, z))
    o = bpy.context.object
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(x, y, z), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    if h:
        o.scale = (1, 1, h / r)
    return _finish(o, color, glow, smooth=True, alpha=alpha)


def beam(a, b, t, color):
    """A square strut of thickness t from point a to point b."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    bpy.ops.mesh.primitive_cube_add(location=((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2))
    o = bpy.context.object
    o.scale = (t / 2, t / 2, length / 2)
    o.rotation_mode = "QUATERNION"
    from mathutils import Vector
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)))
    return _finish(o, color)


def prism(verts, faces, color):
    """A mesh from its vertices and faces (roof prisms, pediments)."""
    mesh = bpy.data.meshes.new(color)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(color, mesh)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(toon(color))
    return ob


def windows(x0, y, z, n, step, w, h, color="glass", axis="x"):
    """A row of lit windows on a face at y (axis x) or x (axis y), slightly proud of it."""
    for i in range(n):
        if axis == "x":
            box(x0 + i * step, y, z, w, 0.04, h, color, glow=True)
        else:
            box(y, x0 + i * step, z, 0.04, w, h, color, glow=True)


# --- the buildings (front face toward -y, the right side toward +x) -------------------------

def farm():
    box(0, 0, 0, 3.4, 2.0, 0.55, "steel")
    for i in range(5):
        box(-1.3 + i * 0.65, -1.02, 0.18, 0.36, 0.04, 0.2, "lime", glow=True)
    dome(-0.2, 0.0, 0.55, 1.25, "glass", h=1.15, alpha=0.45)
    for i in range(4):
        for j in range(3):
            ball(-0.95 + i * 0.5, -0.5 + j * 0.5, 0.75, 0.17, "green" if (i + j) % 2 else "lime")
    for x in (1.35, 1.75):
        for y in (0.45, 0.85):
            beam((x, y, 0.55), (x, y, 1.6), 0.08, "steel_d")
    cyl(1.55, 0.65, 1.6, 0.42, 0.75, "sky")
    cyl(1.55, 0.65, 2.35, 0.42, 0.18, "sky", r2=0.06)


def mine():
    for (x, y, r, s) in ((-1.35, 0.5, 0.45, 0.55), (1.45, 0.7, 0.38, 0.45)):
        ball(x, y, 0.0, r, "rock", sz=s)
    box(0, 0, 0, 1.6, 1.2, 0.85, "red")
    box(0, -0.62, 0, 0.5, 0.04, 0.6, "amber", glow=True)
    for sx in (-1, 1):
        beam((sx * 0.75, -0.2, 0.85), (sx * 0.25, -0.2, 3.0), 0.14, "rust")
        beam((sx * 0.75, 0.3, 0.85), (sx * 0.25, 0.3, 3.0), 0.14, "rust")
    for z in (1.5, 2.2):
        k = (z - 0.85) / 2.15
        w = 0.75 - 0.5 * k
        beam((-w, -0.2, z), (w, -0.2, z), 0.08, "rust")
    bpy.ops.mesh.primitive_torus_add(major_radius=0.55, minor_radius=0.07, location=(0, 0.05, 3.15), rotation=(math.pi / 2, 0, 0))
    _finish(bpy.context.object, "steel", smooth=True)
    for a in range(0, 180, 45):
        r = math.radians(a)
        beam((-0.55 * math.cos(r), 0.05, 3.15 - 0.55 * math.sin(r)), (0.55 * math.cos(r), 0.05, 3.15 + 0.55 * math.sin(r)), 0.05, "steel_d")
    box(1.35, -0.7, 0.12, 0.8, 0.5, 0.4, "steel_d")
    ball(1.35, -0.7, 0.52, 0.32, "gold", sz=0.2)
    for x in (1.1, 1.6):
        cyl(x, -0.98, 0.0, 0.12, 0.06, "dark", rot=(math.pi / 2, 0, 0))


def manufactory():
    box(-0.3, 0, 0, 3.0, 1.8, 1.0, "brick")
    for i in range(3):
        x = -1.45 + i * 1.0
        verts = [(x, -0.9, 1.0), (x + 0.9, -0.9, 1.0), (x + 0.9, -0.9, 1.5), (x, 0.9, 1.0), (x + 0.9, 0.9, 1.0), (x + 0.9, 0.9, 1.5)]
        faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (0, 2, 5, 3)]
        prism(verts, faces, "rust")
        box(x + 0.88, 0, 1.0, 0.04, 1.6, 0.45, "glass", glow=True)
    windows(-1.5, -0.92, 0.45, 6, 0.48, 0.26, 0.3, "amber")
    box(-0.3, -0.92, 0.0, 0.6, 0.04, 0.42, "dark")
    cyl(0.6, 0.45, 1.0, 0.2, 1.7, "red")
    cyl(0.6, 0.45, 2.2, 0.205, 0.18, "white")
    cyl(1.05, 0.45, 1.0, 0.17, 1.3, "red")
    for (x, z, r) in ((0.65, 3.0, 0.3), (0.95, 3.35, 0.24), (1.3, 3.55, 0.18)):
        ball(x, 0.45, z, r, "white")
    box(1.6, -0.6, 0, 0.5, 0.5, 0.5, "gold")


def trade_hub():
    box(0.3, 0, 0, 2.4, 1.6, 0.85, "steel")
    windows(-0.6, -0.82, 0.38, 6, 0.36, 0.2, 0.3, "glass")
    box(0.3, -0.82, 0, 0.5, 0.04, 0.5, "dark")
    dome(0.3, 0, 0.85, 0.85, "gold", h=0.75)
    cyl(0.3, 0, 1.55, 0.04, 0.8, "dark")
    ball(0.3, 0, 2.38, 0.11, "red", glow=True)
    cyl(-1.55, -0.3, 0, 0.75, 0.12, "dark", verts=6)
    for a in range(0, 360, 60):
        r = math.radians(a)
        ball(-1.55 + 0.62 * math.cos(r), -0.3 + 0.62 * math.sin(r), 0.14, 0.06, "amber", glow=True)
    cyl(1.7, 0.4, 0.85, 0.04, 0.9, "dark")
    cyl(1.7, 0.4, 2.1, 0.5, 0.12, "gold", rot=(math.pi / 2, 0, 0))
    box(1.7, 0.32, 1.85, 0.12, 0.04, 0.5, "orange")


def shipyard():
    for x in (-1.7, 1.7):
        box(x, 0.0, 0, 0.35, 0.35, 2.8, "orange")
        for z in (0.5, 1.2, 1.9):
            beam((x - 0.17, -0.18, z), (x + 0.17, -0.18, z + 0.45), 0.05, "dark")
    box(0, 0, 2.8, 3.75, 0.45, 0.3, "amber")
    box(0, 0, 0, 3.0, 1.3, 0.15, "dark")
    for x in (-0.8, 0.0, 0.8):
        box(x, 0, 0.15, 0.12, 0.12, 0.65, "dark")
    # the hull on the slip: a long tapered body
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.42, radius2=0.12, depth=2.6, location=(0.0, 0, 1.15), rotation=(0, math.pi / 2, 0))
    _finish(bpy.context.object, "white")
    cyl(-1.3, 0, 1.15, 0.2, 0.12, "glass", glow=True, rot=(0, math.pi / 2, 0))
    for i in range(4):
        box(-0.6 + i * 0.35, -0.38, 1.12, 0.12, 0.04, 0.1, "glass", glow=True)
    beam((0.5, 0, 2.8), (0.5, 0, 1.75), 0.03, "dark")
    box(0.5, 0, 1.6, 0.3, 0.2, 0.15, "amber")
    ball(0.35, -0.45, 1.5, 0.1, "amber", glow=True)


def lab():
    box(-0.2, 0, 0, 2.8, 1.6, 0.95, "white")
    windows(-1.25, -0.82, 0.45, 5, 0.5, 0.3, 0.25, "glass")
    dome(-0.2, 0.1, 0.95, 0.95, "steel")
    box(-0.2, -0.55, 1.2, 0.3, 0.6, 0.6, "dark")
    beam((-0.2, -0.3, 1.55), (0.5, -0.6, 2.4), 0.2, "steel_d")
    ball(0.52, -0.62, 2.42, 0.09, "glass", glow=True)
    cyl(1.55, 0.4, 0.0, 0.05, 1.5, "dark")
    cyl(1.55, 0.4, 1.5, 0.45, 0.12, "white", r2=0.1, rot=(0.6, 0, 0))
    cyl(1.6, -0.75, 0, 0.32, 0.38, "lime", glow=True, r2=0.12)
    cyl(1.6, -0.75, 0.38, 0.1, 0.25, "glass")


def warehouse():
    box(-0.3, 0, 0, 3.0, 2.0, 1.5, "steel_d")
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1.0, depth=3.0, location=(-0.3, 0, 1.5), rotation=(0, math.pi / 2, 0))
    o = bpy.context.object
    o.scale = (0.35, 1, 1)
    _finish(o, "steel", smooth=True)
    for x in (-1.0, 0.4):
        box(x, -1.02, 0, 1.0, 0.04, 1.0, "white")
        box(x, -1.04, 1.0, 1.0, 0.04, 0.1, "amber", glow=True)
    box(1.55, -0.6, 0, 0.55, 0.55, 0.55, "rust")
    box(1.55, -0.6, 0.55, 0.45, 0.45, 0.45, "green")
    cyl(1.6, 0.4, 0, 0.25, 0.6, "red")


def temple():
    box(0, 0, 0, 3.2, 2.4, 0.3, "sand")
    box(0, 0, 0.3, 2.4, 1.8, 0.8, "white")
    box(0, 0, 1.1, 1.5, 1.2, 0.7, "white")
    box(0, -0.92, 0.3, 0.55, 0.04, 0.6, "purple")
    cyl(0, -0.62, 1.42, 0.22, 0.04, "pink", glow=True, rot=(math.pi / 2, 0, 0))
    cyl(0, 0, 1.8, 0.35, 1.6, "gold", r2=0.05, verts=8)
    ball(0, 0, 3.5, 0.13, "amber", glow=True)
    for x in (-1.3, 1.3):
        cyl(x, -0.8, 0.3, 0.03, 1.3, "dark")
        box(x + 0.2, -0.8, 1.25, 0.4, 0.03, 0.3, "purple")


def capitol():
    box(0, 0, 0, 3.6, 2.4, 0.25, "white")
    box(0, 0.15, 0.25, 3.0, 1.6, 1.1, "white")
    for i in range(9):
        cyl(-1.3 + i * 0.325, -0.85, 0.25, 0.08, 1.1, "white")
    verts = [(-1.6, -0.95, 1.35), (1.6, -0.95, 1.35), (0, -0.95, 1.85), (-1.6, 0.0, 1.35), (1.6, 0.0, 1.35), (0, 0.0, 1.85)]
    prism(verts, [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (0, 2, 5, 3)], "white")
    cyl(0, 0.3, 1.35, 0.75, 0.5, "steel", verts=24)
    dome(0, 0.3, 1.85, 0.75, "gold", h=0.7)
    cyl(0, 0.3, 2.55, 0.025, 0.7, "dark")
    box(0.22, 0.3, 2.95, 0.4, 0.03, 0.25, "red")


BUILDINGS = {
    "farm": farm, "mine": mine, "manufactory": manufactory, "trade-hub": trade_hub,
    "shipyard": shipyard, "lab": lab, "warehouse": warehouse, "temple": temple, "capitol": capitol,
}


def scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 8
    sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = RAW
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = RAW / 160
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(140)
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("ink")
    ls.select_by_visibility = True
    ls.select_silhouette = ls.select_border = ls.select_crease = True
    ls.select_external_contour = True
    style = ls.linestyle or bpy.data.linestyles.new("ink")
    ls.linestyle = style
    style.color = INK
    style.thickness = RAW / 160
    style.caps = "ROUND"
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.color = (0, 0, 0)
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 5.0
    # three-quarters from the front right and above, looking at the middle of the building
    d = (5.0, -9.0, 6.0)
    cam.location = d
    from mathutils import Vector
    cam.rotation_euler = (Vector((0, 0, 1.15)) - Vector(d)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    return sc


def post(raw_path, out_path):
    """Crop square around the building, lay a soft ground shadow under its footprint and shrink
    to SIZE."""
    im = Image.open(raw_path).convert("RGBA")
    x0, y0, x1, y1 = im.getbbox() or (0, 0, RAW, RAW)
    w, h = x1 - x0, y1 - y0
    side = int(max(w, h) * 1.1)
    left, top = (x0 + x1) // 2 - side // 2, y1 + side // 25 - side
    canvas = Image.new("RGBA", (side, side))
    shadow = ImageDraw.Draw(canvas)
    foot = y1 - top
    shadow.ellipse(((side - w * 0.9) / 2, foot - side * 0.1, (side + w * 0.9) / 2, foot + side * 0.03), fill=(12, 10, 20, 150))
    canvas = canvas.filter(ImageFilter.GaussianBlur(side / 45))
    canvas.alpha_composite(im.crop((left, top, left + side, top + side)))
    canvas.resize((SIZE, SIZE), Image.LANCZOS).save(out_path, optimize=True)


def main(only=None):
    os.makedirs(OUT, exist_ok=True)
    raw_dir = os.environ.get("INK_TMP", "/tmp/falchion-ink")
    os.makedirs(raw_dir, exist_ok=True)
    for name, fn in BUILDINGS.items():
        if only and name not in only:
            continue
        sc = scene()
        fn()
        raw = os.path.join(raw_dir, f"{name}.png")
        sc.render.filepath = raw
        bpy.ops.render.render(write_still=True)
        post(raw, os.path.join(OUT, f"{name}.png"))
        print("drew", name, flush=True)


if __name__ == "__main__":
    main(set(sys.argv[1:]) or None)
