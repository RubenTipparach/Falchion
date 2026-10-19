## Why
The owner looked at planets up close and found worlds that did not match their system view:
- "eye ball planet up close implemented wrong, do an audit of all planet types, ensure they are implemented right! also we have diamond worlds right?"
- "we should have LOTs of cratered and canyon worlds, especially on ones without atmos"
- "choir world is also another world up close that doesnt make sense, when you audit check worlds from mid range and close range"
- "volcanic worlds should also have actual volcanoes"
- "where the craters?"
- "bone worlds are kinda goofy looking, the aliens wouldnt be that big! its more like a world covered in dead plants and animals, only really visible from the surface"
- "storm planets are little too active, tone down the activity"

## What Changes
- **Landforms.** Relief over the noise terrain, in one CPU copy (`src/core/surface/Relief.ts`, which bakes the globe) and one GLSL copy (`relief.glsl.ts`, for the system view and the close-up's detail patch). Both hash on exact integers, so they agree.
  - **Craters:** at every size the zoom reaches.
  - **Canyon networks:** a canyon world is carved across most of its face.
  - **Volcanoes:** shield cones centred on the surface, each with a glowing caldera and lava rivers.
  - **Tidally locked basin:** the sunward basin of a tidally locked world.
- **Craters and canyons on airless worlds.** Barren, desert, ice, rust, diamond, dead machine and bone worlds carry them. The system view shades them by their albedo and a relief bump, which fades where it would alias.
- **New types:**
  - **Diamond:** a carbon world, glittering. Mostly round white dwarfs and hot stars.
  - **Canyon:** a world cut by canyons.
- **The eyeball (tidally locked) world** keeps its basin facing the star, in every view. Its night side is frozen.
- **Patterns** come from one shared copy (`patterns.glsl.ts`), so the close-up draws them as orbit does, and adds finer detail close up. Patterns cover city, dead machine, choir circuits and bone worlds.
- **Bone worlds** are dead worlds: dead forests, ash plains and salt flats. The bones and fallen trunks show only near the ground.
- **Storm worlds:**
  - their cyclones turn more slowly and lightning is rarer;
  - from the ground, a world under a thick deck has an overcast sky.
- **The audit tool.** `npm run planets` writes a sheet with every type four ways: system view, orbit, mid range and close.

## Impact
- **Core:** `Relief.ts`, `Terrain.ts`.
- **Content:** `planetLooks`, `biomes` and `resources` (diamond, canyon).
- **Render:**
  - `PlanetMaterial`, the surface shaders, `SurfaceTerrain` and `atmosphere.glsl`;
  - `SystemLayer` and `PlanetThumbnails` for locked worlds;
  - the audit tool (`planetAudit.ts`, `tools/planets/`).
