## Why
Planet view stops at a small globe in its orbit. Players asked to see their worlds: the capital
they founded, the buildings they paid for and the towns that grow as a colony does. An approved
standalone mockup (colony survey) showed the direction: a procedural globe you can descend from
orbit to a few kilometres above the ground, with cities, special buildings and night lights.

## What Changes
- A new, deeper zoom level, **Surface**, below Planet on the zoom ladder. Zooming further into the
  focused (rocky) planet, or pressing **Land** on the planet card, descends into a close-up of that
  planet; zooming out returns to planet view without a cut.
- The close-up shows the same world as planet view (same seed, palette, sea level and continents):
  a cube-sphere globe with a CPU heightmap, a GPU high-detail patch near the camera, ocean, biome
  colours, polar ice, clouds that fade on approach, an atmosphere shell and the day/night
  terminator from the system's star.
- What stands on it comes from the game state, never sample data:
  - your colony: its capital (or main city) named after the colony, one special-building model per
    building in `colony.buildings` (Orbital Shipyard in low orbit, Research Lab, Temple,
    Manufactory, Trade Hub, Deep Mine pit, Hydroponic Farm, Warehouse), and towns whose number and
    size grow with the colony's size and buildings;
  - another player's or an NPC's world: terrain and one generic city on the system's main world;
  - an unsettled world: terrain only, with a survey label.
- Labels for the city, buildings and towns (CSS2D, like the rest of the map) fly the camera there.
- Phones (touch-first, the map's `lite` mode) get a smaller patch, fewer octaves, a lower pixel
  ratio and no atmosphere raymarch. GPU resources are released when the view is left; the rest of
  the map pays nothing while the surface is not shown.

## Extension points
- `MapLayer` (registered in the `LayerStack`): the surface is its own layer,
  `src/render/planets/surface/SurfaceLayer.ts`. `MapLayer` gains two optional hooks, `covers()` and
  `overlay()`, so any layer can draw a close-up of its own over (or instead of) the map.
- `ZoomModel`: a settable floor (`setFloor`) lets the zoom go below the map's minimum only while a
  surface is available. No other layer is special-cased.
- `MapCameraController`: an optional input capture, so a close-up can take drags and clicks.
- Building models are a registry keyed by building id (`BUILDING_MODELS`); a new building in
  `src/content/buildings.ts` needs a model there (a test fails otherwise).
- Placement is pure and deterministic: `src/core/surface/` (noise, terrain, layout), seeded from the
  planet id with `hashSeed`/`Rng`.

## Out of scope
- Gas giants (no surface to land on), walking or building on the ground, other players' building
  lists (their worlds show a generic city), and any change to game rules or commands (landing is a
  camera action, not an order).

## Impact
- New: `src/core/surface/*`, `src/render/planets/surface/*`.
- Changed: `src/render/map/MapLayer.ts`, `MapView.ts`, `MapCameraController.ts`, `ZoomModel.ts`,
  `SystemLayer.ts`, `src/render/planets/PlanetMaterial.ts` (shares the surface look),
  `src/app/GameController.ts`, `src/app/main.ts`, `src/ui/StarInfoPanel.ts`, `src/ui/Hud.ts`,
  `src/ui/GameActions.ts`, `src/ui/styles.css`.
