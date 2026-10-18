# Skill provenance

| Skill | From | Notes |
| --- | --- | --- |
| `thumbnails` | RubenTipparach/Star-Crew-Bridge-Simulator `.claude/skills/threejs-mockups` and `.claude/skills/blender-hard-surface` (2026-10-17) | Adapted: the mockup shot pipeline and its "look at every shot" rule became the studio and contact sheet; the Blender CSG prop workflow became three.js primitives (no Blender in this project). |
| `material-maker-headless` | RubenTipparach/Star-Crew-Bridge-Simulator `.claude/skills/material-maker-headless` (db2b3d4, 2026-10-18) | The shared part and `scripts/` unchanged; a Falchion section and table row added. |
| `ship-materials` | Falchion's own, after Star Crew's `material-maker` skill (db2b3d4) | Star Crew's rules (graph is the one implementation, relief baked into the colour, emission mask, packed layers, a contact sheet looked at) applied to procedural ship hulls: triplanar in ship space instead of a texture array. `tools/materials/build_ptex.py` keeps Star Crew's `Graph` helper unchanged. |
