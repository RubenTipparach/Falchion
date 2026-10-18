## Why
The owner asked for hand-drawn art in different styles, after godot-sandbox's hand-drawn art. Building pictures are
3D renders only. A drawn picture reads better at 28 px and gives the game a look of its own.

## What Changes
- **Three drawn styles** for every building and the capitol, drawn in code under `tools/art`:
  - **Pixel:** 64 px, outlined, dithered (`pixelkit.py`, after godot-sandbox's Canvas).
  - **Ink:** modelled in Blender, cel-shaded, Freestyle outlines (`blender_ink_buildings.py`).
  - **Marker:** felt-tip, 128 px (godot-sandbox's `crayon.py`).
- **An art style setting** (Empire › Overview › Building art): Rendered, Pixel, Ink or Marker.
  - It is per viewer (this browser), not saved with the empire, and changes no rules.
  - Building pictures on screen switch at once. A missing picture falls back to the render.
- **A `hand-drawn-art` skill** on drawing, checking and adding styles.

## Impact
- **Content:** `artStyles.ts` (the style table), with a test that every building is drawn in every style.
- **Render:** `thumbs/drawnArt.ts` (the viewer's choice) and `Thumbnails.ts` (drawn buildings).
- **UI:** the Building art card.
- **Assets:** `public/art/buildings/{pixel,ink,marker}` (about 400 KB).
