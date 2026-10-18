#!/usr/bin/env python3
"""Pack Material Maker's renders of the hull graphs into the textures ShipKit maps onto ships.

For each graph `hull_<name>` in the raw folder (Material Maker's Godot 4 Standard export:
_albedo, _normal, _orm, and _emission when wired) it writes, at SIZE px:

  public/textures/ships/<name>.png    R shade: albedo luminance with the ambient occlusion and the
                                      relief baked in under a fixed key light from the upper left
                                      (ShipKit tints it with the design's colour; its mean is 0.7),
                                      G ambient occlusion, B emission mask, A roughness

Downsampling wraps (the maps tile), so the layer still tiles. It also writes the manifest
(public/textures/ships/manifest.json: sizes, bytes, sha256, the Material Maker revision) and the
contact sheet docs/screenshots/materials/ships.png. Look at the sheet before calling it done.

    python3 tools/materials/postprocess.py /tmp/mm-ships
"""
import hashlib
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "textures", "ships")
SHEET = os.path.join(ROOT, "docs", "screenshots", "materials", "ships.png")
SIZE = 256
NAMES = ["technological", "utilitarian", "organic", "geometric", "classic", "industrial", "machinery"]


def wrapped_resize(im, size):
    """Downsample a tiling image so the result tiles: resize a 3x3 tiling and keep the middle."""
    w, h = im.size
    big = Image.new(im.mode, (w * 3, h * 3))
    for i in range(3):
        for j in range(3):
            big.paste(im, (i * w, j * h))
    small = big.resize((size * 3, size * 3), Image.LANCZOS)
    return small.crop((size, size, size * 2, size * 2))


def bake_relief(albedo, ao, normal):
    """Albedo x AO x a key light from the upper left at 45 degrees (lit edges up, shaded edges down),
    rescaled so its mean is 0.7: ShipKit divides by 0.7, so a hull keeps its colour on average."""
    import numpy as np
    a = np.asarray(albedo, dtype=np.float32) / 255
    o = np.asarray(ao, dtype=np.float32) / 255
    n = np.asarray(normal, dtype=np.float32) / 127.5 - 1
    light = np.array([-0.45, 0.45, 0.77], dtype=np.float32)
    light /= np.linalg.norm(light)
    lambert = np.clip(n @ light, 0, 1) / light[2]
    shade = a * (0.35 + 0.65 * o) * (0.55 + 0.45 * lambert)
    shade *= 0.7 / max(1e-3, float(shade.mean()))
    return Image.fromarray(np.clip(shade * 255, 0, 255).astype(np.uint8), "L")


def luminance(im):
    return im.convert("RGB").convert("L")


def main(raw):
    os.makedirs(OUT, exist_ok=True)
    manifest = {"generator": "tools/materials/postprocess.py", "size": SIZE, "source": source_note(raw), "files": {}}
    tiles = []
    for name in NAMES:
        base = os.path.join(raw, f"hull_{name}")
        albedo = luminance(Image.open(base + "_albedo.png"))
        orm = Image.open(base + "_orm.png").convert("RGB")
        ao, rough, _metal = orm.split()
        em_path = base + "_emission.png"
        emission = luminance(Image.open(em_path)) if os.path.exists(em_path) else Image.new("L", albedo.size, 0)
        normal = Image.open(base + "_normal.png").convert("RGB")
        shade = bake_relief(albedo, ao, normal)
        packed = Image.merge("RGBA", [wrapped_resize(c, SIZE) for c in (shade, ao, emission, rough)])
        normal_s = wrapped_resize(normal, SIZE)
        for img, file in ((packed, f"{name}.png"),):
            path = os.path.join(OUT, file)
            img.save(path, optimize=True)
            data = open(path, "rb").read()
            manifest["files"][file] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        tiles.append((name, packed, normal_s))
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    write_sheet(tiles)
    total = sum(v["bytes"] for v in manifest["files"].values())
    print(f"wrote {len(manifest['files'])} textures to {os.path.relpath(OUT, ROOT)}, {total:,} bytes; sheet {os.path.relpath(SHEET, ROOT)}")


def write_sheet(tiles):
    """Per material: the tinted albedo (a blue-grey hull), the emission, the normal map, and a 2x2 tiling."""
    pad, w = 6, SIZE
    sheet = Image.new("RGB", (pad + 4 * (w + pad), pad + len(tiles) * (w + pad)), (14, 18, 26))
    for row, (name, packed, normal) in enumerate(tiles):
        r, g, b, a = packed.split()
        shade = Image.merge("RGB", [r.point(lambda v, k=k: int(v * k * (g.getpixel((0, 0)) * 0 + 1))) for k in (0.78, 0.86, 1.0)])
        glow = Image.merge("RGB", [b.point(lambda v, k=k: int(v * k)) for k in (0.5, 0.9, 1.0)])
        lit = Image.blend(shade, glow, 0.0)
        lit.paste(glow, mask=b)
        tiled = Image.new("RGB", (w * 2, w * 2))
        for i in range(2):
            for j in range(2):
                tiled.paste(lit, (i * w, j * w))
        y = pad + row * (w + pad)
        for col, img in enumerate((shade, glow, normal, tiled.resize((w, w)))):
            sheet.paste(img, (pad + col * (w + pad), y))
    os.makedirs(os.path.dirname(SHEET), exist_ok=True)
    sheet.save(SHEET, optimize=True)


def source_note(raw):
    """Where the maps came from (the Material Maker checkout's revision, when known)."""
    rev = None
    mm = os.environ.get("MM_DIR", "/tmp/material-maker")
    head = os.path.join(mm, ".git", "HEAD")
    if os.path.exists(head):
        rev = open(head).read().strip()
        if rev.startswith("ref:"):
            ref = os.path.join(mm, ".git", rev.split(" ", 1)[1])
            rev = open(ref).read().strip() if os.path.exists(ref) else rev
    return f"Material Maker {rev or 'unknown revision'}, headless on lavapipe, rendered at 1024 px from tools/materials/ptex/"


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mm-ships")
