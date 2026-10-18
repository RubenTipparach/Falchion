## 1. Slow planets (src/render/map/SystemLayer.ts)
- [x] 1.1 Orbit and spin at a tenth of the old speeds. A planet held by the close-up keeps the same spin (manual check: Playwright rates, before 0.0471/0.15 rad/s, after 0.00471/0.015 rad/s, the same when held)

## 2. Population, cities and roads (src/core)
- [x] 2.1 `Colony.pop` and `populationOf` (test: `src/core/economy/population.test.ts` "is a whole number, at least 1")
- [x] 2.2 One major city per point of population, the capital first, towns as scenery; deterministic (tests: `surface.test.ts` "one major city per point of population", "towns stand on land", "same planet id gives the same layout", "golden layout")
- [x] 2.3 `roadNetwork`: spanning tree plus extra links, routed over the terrain with a seeded A* search, bridges over short straits only (tests: `roads.test.ts` "roads are deterministic", "every settlement on the main city's land is reachable", "roads mostly run over land and bridge only short straits", "roads run from the edge of one settlement to the edge of the other", "extra links shorten detours")
- [x] 2.4 `nightLights(layout)` (test: `roads.test.ts` "lights follow the settlements and roads")

## 3. Rendering
- [x] 3.1 `NightLightMap` and the shared `planetLayouts` cache, drawn by the system view's planet material and the close-up's terrain (manual check: Playwright, the capital at night at s = 8, 5, 3.2, 2.2 and 1.5)
- [x] 3.2 `SystemEvents.colonyOf`: lights on every settled world; none on unsettled ones
- [x] 3.3 `RoadMesh`: ribbons laid on the terrain as drawn, with a minimum screen width, lit at night, with bridges
- [x] 3.4 Up to 32 settlements in the terrain shader. Major-city labels whenever the close-up drives the view, town labels closer in

## 4. Camera and background (src/render/map)
- [x] 4.1 `MapLayer.poseCamera` / `LayerStack.poseCamera`; the surface layer moves the map camera to its own viewpoint (manual check: Playwright bgsync, the map's star and planets 135-2958 px off before, 0 px after)
- [x] 4.2 Planet lighting uses the camera each planet is drawn with (`onBeforeRender`)

## 5. Terrain (src/core/surface/Noise.ts, src/render/planets/surface)
- [x] 5.1 CPU and GPU noise flip the same gradients (test: `surface.test.ts` "noise is deterministic and bounded", float32 against float64 for every hash; manual check: GPU readback matches the CPU to 4 decimals)
- [x] 5.2 The patch's outer ring morphs onto the baked globe's triangles (manual check: Playwright, 8 fixed horizon spots on a jungle world, before and after)
- [x] 5.3 Anchored detail noise and a resolution-limited octave count (manual check: Playwright zoom sequence over one spot, before and after)

## 6. UI (src/ui, src/app)
- [x] 6.1 Closing the planet card keeps the camera; the card comes back on focus or from the locator (manual check: Playwright desktop and phone, the zoom target is unchanged after closing)
- [x] 6.2 City locator: a floating "Cities" button and list; picking a city flies there (manual check: Playwright desktop and phone)
- [x] 6.3 Planet card: "Pop N · N cities", a locate button and a thumbnail slot on each building chip (manual check: Playwright, Temple and Research Lab located)

## 7. Checks
- [x] 7.1 `tsc --noEmit`, `vitest run`, `openspec validate --all --strict`, `npm run build`
- [x] 7.2 Playwright, desktop 1440x900 and phone 390x844; no console errors
