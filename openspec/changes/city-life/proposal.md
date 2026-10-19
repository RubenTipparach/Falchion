## Why
The owner asked for more detailed cities:
- cars, flying cars and ships in the air, and people walking the streets;
- buildings with more decor and windows, and street lamps;
- a city world that is seen far off;
- more elaborate road patterns (fractals, circles, grids), after Star Wars' ecumenopolis.

## What Changes
- **City life (`CityLife`)**, five instanced draws that the GPU moves by the clock (`LIFE_VERT`):
  - **cars** in lanes both ways on every street, the capital's avenues and its ring road, with headlights and tail lights at night;
  - **flying cars** in sky lanes at their own heights;
  - **shuttles** climbing nose-up from pads to the orbital shipyard, and **freighters** crossing high above;
  - **people** walking the pavements;
  - **street lamps** every half block on both sides.
  
  Anything under half a pixel is not drawn. Phones get about half as many.
- **The streets up close:**
  - pavements, dashed centre lines, lane lines on the main streets and zebra crossings;
  - at night, pools of light under each lamp instead of an even glow. Detail fades out where it would shimmer.
- **The towers:**
  - plant on the roofs, and masts with beacons;
  - a floor with no windows every eighth storey;
  - glazed lobbies lit at street level.
- **The city world:**
  - **draw distance:** a `far` flora layer of megatowers (setbacks, crown, mast) runs out to half a planet radius;
  - **sky traffic:** sky cars and skyships fly the grid's lanes (flora entries with `drift` and `hover`);
  - **the ground pattern:** districts, blocks split again and again by a hash (fractal streets), circular plazas with rings and spokes, and diagonal boulevards. Close in, the wide roads' glow narrows to threads of light down their lanes.
- **A tool:** `npm run planets:city` renders a capital and a city world by day and by night, from an overview, street level and close.

## Impact
- **New:** `src/render/planets/surface/CityLife.ts`, `cityShots.ts` and `tools/planets/city.*`.
- **Changed:** `LIFE_VERT`, `STRUCT_FRAG` and the city street code in `TERRAIN_FRAG` (`shaders.ts`), `Settlements.ts` (rooftops), the city world's pattern (`patterns.glsl.ts`), `Flora.ts` and `FloraModels.ts` (the far layer, motion, megatower, flyer, skyship), and `content/flora.ts`.
- **Cost:** the city world's close-up costs about what a jungle world's does (`npm run planets:bench`).
