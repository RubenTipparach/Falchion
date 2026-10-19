## Why
The owner: "Consider foliage on planets. Planet worlds like jungle, plains, swamp world need trees, grass, groves. Rocky worlds need rocks. City worlds need cities, bone worlds need bones etc.". Up close, every surface was bare ground.

## What Changes
- **A flora table per planet type** (`src/content/flora.ts`, data only), in two layers:
  - **large:** trees, groves, boulders, crags, spires, wrecks and city blocks;
  - **small:** grass, ferns, reeds, stones, small crystals and bone fragments.
- **What each world gets:**
  - **Living worlds:** broadleaf, conifer, palm and jungle trees in groves; grass in meadows; ferns and shrubs.
  - **Swamps:** mangrove-like trees, dead trees and reeds, growing out of the shallows.
  - **Deserts:** cacti and dry scrub.
  - **Rocky and airless worlds:** boulders and stones.
  - **Ice worlds:** ice crags.
  - **Volcanic and magma worlds:** lava rocks with glowing cracks.
  - **Toxic and acid worlds:** glowing fungi.
  - **Diamond worlds:** crystal spikes.
  - **Bone worlds:** whole skeletons, ribcages, tusks arching out of the ground, bones and dead trees, bone-white on darker dust.
  - **Dead machine worlds:** wrecks and ruined blocks.
  - **Choir worlds:** glowing spires.
  - **City worlds:** city blocks and spires with lit windows at night.
- **Shapes** (`FloraModels.ts`): low-poly and flat-shaded. Tinted parts take each prop's colour, and some parts glow.
- **Placement** is on the GPU (`Flora.ts`, `FLORA_VERT`):
  - **The grid:** one instanced draw per kind, on a grid anchored to the planet round the detail patch. Every visit and every player sees the same props in the same places.
  - **Each prop:** its cell's hash picks the prop's kind, place, size, turn and colour, and noise gathers props into groves.
  - **Ground:** props stand on the ground as drawn (the patch's own height).
  - **Where props grow:**
    - nothing in water, except plants that grow in the shallows;
    - nothing in cities;
    - nothing living on ice caps, snowy peaks or a locked world's frozen side.
  - **Fading:** the large layer comes in below about 0.1 radii, the small one near the ground. Props grow in rather than pop, and sway in the wind.
- **Bone worlds:** the flat bone markings painted on the ground are replaced by the 3D props.
- **The audit sheet:** a fifth column shows each type on the ground.

## Impact
- **Content:** `flora.ts`.
- **Render:**
  - `surface/FloraModels.ts`, `surface/Flora.ts`;
  - the `FLORA_VERT` and `FLORA_FRAG` shaders;
  - `SurfaceLayer` (builds, fades and disposes the flora);
  - `patterns.glsl` (no painted bone debris);
  - the audit.
