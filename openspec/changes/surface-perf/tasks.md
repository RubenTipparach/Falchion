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
