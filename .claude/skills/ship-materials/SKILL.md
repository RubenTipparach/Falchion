---
name: ship-materials
description: Make, change and judge the hull plating of Falchion's procedural ships - one Material Maker graph per ship style (technological, utilitarian, organic, geometric, classic) plus a machinery graph for detail parts, rendered headless, packed into small textures (shade with baked relief, occlusion, emission mask, roughness) and laid triplanar in ship space by ShipKit, tinted by the design's colours with lights in its accent. Adapted from Star Crew Bridge Simulator's material-maker skill. Use when adding or changing a hull texture, a style's look up close, panel lines, lit windows, glowing seams, texture size or tiling, or when a ship looks flat, swims, has seams, or comes out black ("hull texture", "ship plating", "panel lines", "windows on ships", "ptex", "Material Maker", "ships look flat").
---

# Ship materials: hull plating

The owner, 2026-10-18: "Pull in blender, material maker skills and get to work designing good
textures and stuff." Ships are built from code (`src/render/ships/styles`), so their surfaces
cannot be UV-painted: every hull and detail part gets a tiling plating, mapped triplanar in the
ship's own frame. This skill is how. Material Maker runs here (the `material-maker-headless`
skill); never write an image generator that imitates a graph (Star Crew's rule: the graph is the
one implementation of how a material looks).

## The parts

| File | What it is |
| --- | --- |
| `tools/materials/build_ptex.py` | The graphs, written from Python (Star Crew's `Graph` helper, unchanged): `hull_<style>` and `hull_machinery`. Run it after editing a graph |
| `tools/materials/ptex/*.ptex` | The graphs. They open in Material Maker 1.7+ for hand tweaking (then drop the graph from `GRAPHS` or the next run overwrites it) |
| `tools/materials/export_materials.sh` | Renders every graph at 1024 px into `/tmp/mm-ships`, then packs them |
| `tools/materials/postprocess.py` | The packing: shade, occlusion, emission, roughness into one 256 px RGBA per graph; the manifest; the contact sheet |
| `public/textures/ships/<name>.png` | The textures the game loads (about 0.5 MB in all) |
| `public/textures/ships/manifest.json` | Sizes, bytes, sha256, the Material Maker revision. Written by the post-process, never by hand |
| `docs/screenshots/materials/ships.png` | The maps' contact sheet: look at it |
| `src/render/ships/hullTextures.ts` | Loading, the triplanar shader patch (`applyHullTexture`) and the ship-space bake (`bakeShipSpace`) |

## The rules

- **Albedo is light and dark, never hue.** A graph's albedo is near-neutral grey; the shader
  multiplies it into the design's primary (hull) or secondary (detail) colour, so any palette
  works. The packed shade's mean is 0.7 and the shader divides by it, so a hull keeps its colour
  on average.
- **Relief is baked into the shade**, under a key light from the upper left at 45 degrees with the
  occlusion (Star Crew's material rule). No normal maps ship: at the sizes ships are seen, baked
  relief reads, and it costs nothing at run time.
- **Emission is a mask lit in the accent.** Windows, glowing seams and veins go in the emission
  port; the shader adds `accent × mask` (machinery at 0.6 strength).
- **Packed layout:** R shade, G occlusion, B emission, A roughness. Downsampling wraps, so a layer
  tiles.
- **Triplanar in ship space.** `ShipFactory.create` bakes each hull and detail part's position and
  normal in the ship's frame into `aShip` / `aShipN`; the plating runs on across parts and does not
  swim as the ship moves. One repeat covers 1.6 units (a length-1 ship is 4 long). A part that
  shares a geometry with another gets its own copy first.
- **Browser only, after loading.** Outside a browser (the server, the tests) nothing loads and the
  materials stay plain. In the app `preloadHullTextures()` runs with the world clock, so thumbnails
  are drawn textured; a material switches on once its texture has loaded (`uPlateOn`).

## Making or changing a plating

1. Edit or add the graph in `build_ptex.py` (copy a neighbour; nodes used: `bricks`,
   `bricks_uneven`, `voronoi` (ports: 0 cells, 1 borders, 2 random colour), `fbm2`, `sdcircle`,
   `sdrepeat`, `sdshow`, `warp`, `scratches`, `tonality`, `colorize`, `blend`, `math`). Material
   Maker's node definitions are in `$MM_DIR/addons/material_maker/nodes/<node>.mmg`: read a node's
   parameters and outputs there rather than guessing.
2. `python3 tools/materials/build_ptex.py`, then `bash tools/materials/export_materials.sh`.
3. Read `docs/screenshots/materials/ships.png`, then the ships themselves:
   `NODE_PATH="$(npm root -g)" node tools/thumbs/shoot.mjs --only hull --px 220 --ids <style>`
   (big tiles; `--px` is for judging detail).
4. A new style: add its graph, its name to `NAMES` in `postprocess.py` and to
   `HULL_TEXTURE_NAMES` in `hullTextures.ts`.

## Pitfalls actually hit

| You see | Cause | Fix |
| --- | --- | --- |
| An emission map all black | A `bricks` mortar of 0.5 leaves no brick; a `pattern` with scale 0 is empty | Mortar 0.25-0.35; build bands from `bricks` rows |
| Worm-like white squiggles | `scratches` at large width on plates | Leave scratches off hull plating |
| Glow on every seam | Emission taken from all voronoi borders | Glow only on selected cells (threshold the per-cell random output) |
| Panels read as tiles or boxes | Bevel too wide for small panels | Bevel 0.008 on `bricks_uneven` panels |
| A ship comes out black | Sampling a texture that has not loaded | `uPlateOn` stays 0 until load; the shader then uses a flat 0.7 shade |
