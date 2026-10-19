## Why
The owner: "Zooming into planets is locking up my PC". Measuring found two causes:
- **The GPU (the lock-up).** Up close, the flora shader evaluated the full terrain height for every vertex of every prop in every cell of its window, every frame. Most of those cells were then thrown away. That came to:
  - a jungle world: 15 million vertex-shader runs and 4.8 million terrain evaluations a frame;
  - a bone world: 108 million runs and 23.6 million evaluations a frame.
  
  That is enough to stall a graphics driver, which freezes the whole desktop, not just the tab.
- **The CPU (stutter).** The close-up's globe baked one cube face per frame on the main thread, at 60 to 250 ms a face: six hitches of up to a quarter of a second as the planet comes in.

## What Changes
- **Flora placement once a cell, on the GPU.** Each flora layer renders a small float texture, one texel per cell of its window, holding the ground point under the cell's prop and how far it has grown. Every vertex of the prop reads that texel instead of evaluating the terrain. The terrain is evaluated about 15,000 times a frame, the same for every planet type.
- **Each kind draws only its cells.** A cell's kind and whether anything can grow there come from a hash alone. The CPU computes it with a port of the shader's hash, and lists each kind's cells when the window moves to new cells. A kind then draws those cells only, not the whole window.
- **Fallback:** without float render targets, the vertex shader places props itself, as before, but still only for the listed cells.
- **Lighter bones.** Bone limbs are open five-sided tubes, ribs have fewer segments, and the small bone's knuckles are coarser. A skeleton goes from 3,732 vertices to 1,458, a ribcage from 5,604 to 2,148, and the small bone from 1,080 to 360.
- **The globe bakes in Web Workers.** The bake is a pure function in core (`GlobeBake.ts`). All six faces go to a small worker pool and bake in parallel, off the main thread. Where there are no workers (tests, Node), the old path stays: one face a frame.
- **A bench.** `npm run planets:bench` prints, per planet type:
  - the bake time;
  - the close-up's frame time at a close and a ground pose, with and without flora;
  - a check that the GPU and CPU hashes agree.

## Impact
- **Render:** `Flora.ts`, `floraCells.ts` (new), `shaders.ts` (FLORA_GLSL, FLORA_PLACE_FRAG), `FloraModels.ts`, `SurfaceTerrain.ts`, `BakePool.ts` (new), `bake.worker.ts` (new).
- **Core:** `src/core/surface/GlobeBake.ts` (new).
- **Tools:** `tools/planets/bench.*` and `planetBench.ts`.
- **The look is unchanged**, except bones with fewer facets.
