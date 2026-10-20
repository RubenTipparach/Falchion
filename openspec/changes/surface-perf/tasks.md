## 1. Measure
- [x] 1.1 CPU stages of the close-up (layout, bake, settlements, flora) and the flora's vertex and terrain load per planet type
- [x] 1.2 `npm run planets:bench`: frame time with and without flora, bake time, hash parity

## 2. Flora
- [x] 2.1 Placement pass (FLORA_PLACE_FRAG) and PLACED vertex path; fallback without float render targets
- [x] 2.2 CPU cell lists per kind (floraCells.ts), matching the shader's hash
- [x] 2.3 Lighter bone props

## 3. Globe
- [x] 3.1 Pure bake in core (GlobeBake.ts); worker pool; sync fallback

## 4. Shader compile and loops (after the city update)
- [x] 4.1 No derivatives inside any shader loop (city streets, fractal streets, choir traces)
- [x] 4.2 Close-up compiled in the background before it is shown; flora settles its placement path up front and puts the placement shader in the scene
- [x] 4.3 The placed flora shader leaves the terrain out
- [x] 4.4 Shader warm-up at start-up (ShaderWarmup) with a progress pill (LoadingPill); "Building the surface" while a close-up builds
- [x] 4.5 Warm-up compiles one program at a time, pausing while the tab is hidden or the view is being moved (all at once froze Chrome)
- [x] 4.6 Close-ups wait for their own shaders: Land and zooming in move the planet's to the front, say so, and land when ready
- [x] 4.7 System view in the warm-up, against the map's lights; a new system hidden until ready, the last kept until then; megastructure sizes as uniforms; your worlds' night lights built while idle
- [x] 4.8 Two programs in flight with parallel compile, 30 ms between batches
