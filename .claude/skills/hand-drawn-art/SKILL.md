---
name: hand-drawn-art
description: Draw Falchion's hand-drawn building pictures in code and keep the art styles a viewer can pick (Rendered, Pixel, Ink, Marker) - 64 px pixel art with tools/art/pixelkit.py, 128 px felt-tip marker with tools/art/crayon.py (both after godot-sandbox's hand-drawn art), and comic ink modelled in Blender (bpy, Cycles on the CPU, Freestyle outlines). Use when adding a building (it needs a picture in every drawn style), adding or changing an art style, redrawing a building, or when a drawn building looks wrong ("pixel art", "marker art", "ink style", "hand drawn", "building icon", "art style", "Blender", "Freestyle", "crayon").
---

# Hand-drawn art

The owner, 2026-10-18: "Id like you to try hand drawing some stuff too like building images. Try
some different art styles look at godot sandbox hand drawn art." Building pictures come in styles
each viewer picks for themselves (Empire → Overview → Building art; `localStorage`
`falchion.buildingArt`). The styles are a table, `src/content/artStyles.ts`; a drawn style is a
folder of PNGs, `public/<dir>/<building id>.png`, one per building in `src/content/buildings.ts`
plus `capitol`. `src/render/thumbs/Thumbnails.ts` shows them and falls back to the rendered 3D
model when a picture fails to load. `src/content/artStyles.test.ts` fails when any building is
missing from a drawn style or a picture has the wrong size.

| Style | Drawn by | Size | How it looks |
| --- | --- | --- | --- |
| Rendered | the thumbnail studio (`thumbnails` skill) | any | the surface models, lit |
| Pixel | `tools/art/draw_pixel_buildings.py` + `pixelkit.py` | 64 | near-black outlines, flat colour with one darker and one lighter shade, checkerboard dither, a dithered ground shadow, PICO-8-ish palette |
| Ink | `tools/art/blender_ink_buildings.py` (bpy) | 128 | modelled from primitives, cel-shaded in three flat tones from a fixed upper-left light, Freestyle ink outlines, soft ground shadow |
| Marker | `tools/art/draw_marker_buildings.py` + `crayon.py` | 128 | wobbly ink outline, streaky marker fill with darker and lighter strokes, glows and sparkles; drawn at 512 and shrunk |

## Run

```sh
cd tools/art && python3 draw_pixel_buildings.py && python3 draw_marker_buildings.py   # PIL
/tmp/bpyenv/bin/python tools/art/blender_ink_buildings.py [farm mine ...]          # bpy
```

Blender as a Python module: `python3 -m venv /tmp/bpyenv && /tmp/bpyenv/bin/pip install
bpy==4.5.* pillow` (Python 3.11; about 400 MB, not in the repo). Cycles renders on the CPU, so no
GPU or display is needed; about 3 s a building at 512 px with 8 samples (the materials are
emission only, so few samples are enough).

## Rules

- **Look at the contact sheet before calling it done**:
  `montage -background '#20242c' -fill white -label '%t' -geometry 256x256+6+6 -tile 5x public/art/buildings/<style>/*.png sheet.png`,
  and pixel art with `-filter point` so it is not smoothed. Then look at it in the game, in the
  build menu (30 px) and on the planet card (28 px): a picture must still read at that size, so
  one clear silhouette and one accent (a glow, a flag, a dome) beat detail.
- Every building gets a picture in every drawn style in the same change that adds the building.
- Same viewpoint in every style: the front face toward the viewer, the right side and the roof
  seen from a little above-right, light from the upper left, transparent ground, a ground shadow.
- Pixel: every edge outlined in `P["line"]`; at most three shades of a colour (dither between);
  domes with `Canvas.dome` (a full ellipse pokes through walls), boxes with `Canvas.obox`.
- Marker: draw at 512 with `crayon.Icon`; shapes are polygons the kit wobbles, fills and inks;
  a different `seed` per building so strokes do not repeat.
- Ink: build from the helpers (`box`, `cyl`, `ball`, `dome`, `beam`, `prism`); the material is
  `toon()` (three tones by the normal, emission) or `toon(glow=True)` for windows and lamps;
  see-through glass is `alpha < 1`. Front is -y, right side +x. Freestyle draws silhouettes,
  borders and creases; very thin parts (< 0.03) vanish into their own outline.
- godot-sandbox's own art is the owner's: read it for style, never copy, redraw or restyle it.

## Adding a style

1. A row in `BUILDING_ART_STYLES` (`dir`, `pixelated` for hard-edged art), a `tools/art` script
   that writes every building, and the size check in `artStyles.test.ts`.
2. Contact sheet, then the game. Keep the folder small (the three styles are about 400 KB).
