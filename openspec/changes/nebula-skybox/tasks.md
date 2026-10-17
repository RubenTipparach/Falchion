# Tasks

## 1. Nebula field

- [x] 1.1 `nebulaField.ts`: one unified field (large warp sets shape/colour, detail octaves add density) in GLSL and TypeScript; integer lattice hash; verify `nebulaSky.test.ts` (hash parity, hue kept across detail levels)
- [x] 1.2 `NebulaLayer` uses the shared GLSL and `nebulaDetail(visibleWidth)`; drop the regional crossfade and the sky mode

## 2. Skybox

- [x] 2.1 `nebulaSky.ts` `NebulaSkyPainter`: slab ray-march over a polar grid of field samples, seeded lobes/band/dim side, exposure; verify `nebulaSky.test.ts` (deterministic, never black, plane brighter than poles, map hue, paint time)
- [x] 2.2 `NebulaSkyboxLayer`: icosphere around the camera, per-star cache, colour easing between anchors, fade with system view, opaque-pass background at negative renderOrder
- [x] 2.3 Wire in `main.ts` with a star-or-deep-space anchor resolver
