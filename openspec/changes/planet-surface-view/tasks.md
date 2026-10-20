## 1. Deterministic surface model (src/core/surface)
- [x] 1.1 Simplex noise with exact integer hashing, matching the GLSL used on the GPU (test: `src/core/surface/surface.test.ts` "noise is deterministic and bounded")
- [x] 1.2 `surfaceLookOf(look, seed)`: the planet's sea level, ice, clouds, detail and noise offset, shared with the planet-view shader (test: "the surface look is the planet-view look")
- [x] 1.3 `surfaceLayout(planet, look, colony)`: capital or main city, towns and building sites from the planet id (tests: "same planet id gives the same layout", "towns stand on land", "towns grow with the colony", "one site per building", "foreign worlds get one generic city", "unsettled worlds have no settlements")

## 2. Map extension points
- [x] 2.1 `MapLayer.covers()` / `overlay()` and `LayerStack.covered()` / `overlay()`; MapView skips the map draw (and hides its labels) while a layer covers the screen
- [x] 2.2 `ZoomModel.setFloor` (test: `src/render/map/zoom.test.ts` "a floor lets the zoom go below the minimum")
- [x] 2.3 `MapCameraController.capture`: drags and clicks go to a close-up while it is set
- [x] 2.4 `SystemLayer.planetFrame(id)`: a planet's position, orientation, radius and its star

## 3. Surface layer (src/render/planets/surface)
- [x] 3.1 Terrain: baked cube-sphere (time-sliced) plus a GPU detail patch, ocean, biomes, ice, clouds, atmosphere, terminator
- [x] 3.2 Settlements: instanced towers with lit windows, street grid in the terrain shader, capitol, towns
- [x] 3.3 Building model registry, one model per building id (test: `src/render/planets/surface/buildingModels.test.ts` "every building has a model that faces outward")
- [x] 3.4 Camera rig and the transition: overlay (crossfade, same camera as the map) then the rig; Land flies to the capital
- [x] 3.5 CSS2D labels for the city, buildings and towns that fly the camera there; survey label on unsettled worlds
- [x] 3.6 Lite mode: smaller patch, fewer octaves, lower pixel ratio, no atmosphere raymarch; dispose on leave

## 4. Wiring and UI
- [x] 4.1 GameController: surface target from the game state (own colony, foreign world, unsettled), `land()`, Esc leaves the surface
- [x] 4.2 Planet card Land button; Surface on the zoom ladder; HUD shows Surface view and altitude

## 5. Checks
- [x] 5.1 `tsc --noEmit`, `vitest run`, `openspec validate --all`, `npm run build`
- [x] 5.2 Playwright (desktop 1440x900 and phone 390x844): planet view, mid descent, capital; no console errors
