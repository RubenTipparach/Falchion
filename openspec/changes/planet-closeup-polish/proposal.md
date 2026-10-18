## Why
Players looking at their colonies up close reported these problems with the planet close-up:
1. Planets orbit and spin too fast in the system view.
2. A colonised world shows many city lights from orbit, but they vanish when you zoom in close and
   only one city label is left. The far view and the close view did not show the same places.
3. Colonies with many people still had only a handful of towns, and nothing connected them.
4. In the band where the close-up has taken over the camera but the map is still drawn behind it,
   orbiting the planet did not turn the stars, the sun, the other planets or the orbit lines.
5. From low altitude, dark ribbons of terrain floated above the horizon with sky showing under them.
6. On a phone, closing the planet card zoomed the camera out of planet view.
7. There was no way to jump between a world's major cities.
8. The ground shuffled around while zooming.
9. Population had no visible meaning: each point of population should be one major city.
10. A colony's buildings could not be found on the surface from the planet card.

## What Changes
- System view: planets orbit and spin at a tenth of their old speed. A planet spins at the same rate
  whether or not the close-up shows it, so day and night on the ground follow its spin.
- Population: `Colony.pop`, a whole number, with `populationOf(colony)` in
  `src/core/economy/Population.ts`. Each point of population is one major city on the planet's
  surface, the capital city first. A few towns are scattered between them as scenery. The planet
  card shows "Pop N · N cities".
- A deterministic road network joins the settlements. Trunk roads form a minimum spanning tree, and
  a few extra links shorten long detours. Roads are routed over the terrain, avoid water where they
  can and bridge short straits. They are drawn on the ground, show as faint lines from close orbit
  and are lit at night.
- One night-lights map per settled world is made from its settlements and roads. The system view
  (any settled world, not only the home planet) and the close-up both draw city lights from it, so
  the lights stay in the same places from orbit down to the ground.
- While the close-up drives the camera and the map is still drawn behind it, the map camera follows
  the close-up's camera, so the background turns with the view at every zoom level.
- Terrain: the CPU noise (baked globe) and the GPU noise (detail patch) now agree. They used to flip
  different gradients wherever a gradient's z was exactly 0, so the two disagreed on where the land
  was, and the coarse globe stood above the patch in places, showing sky through the ground near the
  horizon. The patch's outer ring morphs onto the globe's own triangles, so the two meet exactly.
- The ground stays put while zooming. Detail noise uses fixed power-of-two frequencies that
  crossfade, instead of a frequency that followed the zoom. The patch uses only as many octaves as
  its grid can sample, so resampling the grid no longer makes features jump.
- Closing the planet card hides it without moving the camera. Focusing the planet again, or the city
  locator, brings the card back. "Back to system" and Esc still leave planet view.
- A city locator (a floating "Cities" button with a list) jumps the camera to any major city. It
  works in planet view and on the surface, with or without the planet card.
- Every building chip on the planet card has a locate button that flies the camera to that
  building's model on the surface. Each chip also has a thumbnail slot (`thumb('building', id, 28)`
  from `src/ui/thumbs.ts`). The thumbnails themselves come from a shared system outside this change.

## Extension points
- `MapLayer.poseCamera?(camera)`, an optional hook. A layer whose own view drives the camera (a
  close-up) poses the map camera before the map is drawn. `LayerStack.poseCamera` runs it for
  every layer.
- `SystemEvents.colonyOf(planet)`: the system view asks the game what stands on a planet. It no
  longer guesses from the home system.
- `GameQueries.citiesOf(planet)` and `GameActions.land(star, planet, at?)`, where `at` is a city or a
  building.
- New pure modules: `src/core/surface/Roads.ts` (road network), `src/core/surface/NightLights.ts`
  (light spots from a layout) and `src/core/economy/Population.ts`. The rendering is in
  `src/render/planets/NightLightMap.ts`, `src/render/planets/planetLayouts.ts` (a shared cache) and
  `src/render/planets/surface/RoadMesh.ts`.

## Out of scope
- How population grows or declines. Those rules belong to the economy, and this change only reads
  `Colony.pop`.
- Rendering the building thumbnails, traffic, walking, and roads between planets.

## Impact
- Changed: `src/core/surface/*` and their tests, `src/core/economy/Economy.ts` (`Colony.pop`),
  `src/render/map/SystemLayer.ts`, `MapLayer.ts`, `MapView.ts`,
  `src/render/planets/PlanetMaterial.ts`, `noise.glsl.ts`, `src/render/planets/surface/*`,
  `src/app/GameController.ts`, `src/app/main.ts`, `src/ui/StarInfoPanel.ts`, `src/ui/widgets.ts`,
  `src/ui/GameActions.ts`, `src/ui/styles.css` and `src/content/surfaceNames.ts`.
- New: `src/core/surface/Roads.ts`, `NightLights.ts` and `roads.test.ts`;
  `src/core/economy/Population.ts` and `population.test.ts`; `src/render/planets/NightLightMap.ts`
  and `planetLayouts.ts`; `src/render/planets/surface/RoadMesh.ts`; `src/ui/CityLocator.ts` and
  `src/ui/thumbs.ts`.
