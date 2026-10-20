## Why
Two reports from the owner, 2026-10-18:
- "aurora not showing up close, cloud patterns changing when zooming in". The planet close-up (`src/render/planets/surface`) draws its own clouds and atmosphere. They have drifted from the system-view shader: different noise octaves and drift speeds, and none of the new storm cyclones, haze decks or auroras. A planet changes as you zoom in, and a hole opens in the clouds during the hand-over.
- "I dont see any asteroids to mine". Asteroid fields exist in the rules and are listed on the star card, but the system view never draws them.

## What Changes
- **One atmosphere for both views.**
  - Clouds, haze decks, storm cyclones and lightning, and auroras come from one shared GLSL module, called with the same inputs (seed, detail, time, the look's fields) by the system-view planet shader and the close-up.
  - The close-up uses the same clock as the system view. A planet looks the same at every distance, and nothing pops or vanishes at the hand-over.
- **Auroras up close.** The close-up draws the aurora curtains round the poles as a translucent shell above the clouds, visible from low orbit and from the ground at night.
- **Asteroid belts in the system view.** Each field is drawn as a belt of rocks between planet orbits:
  - metals: grey-brown rocks;
  - gases: icy comets with faint tails;
  - crystals: violet shards that glint.

  The belt thins as the field is mined and fills back as it refills. Hovering shows the field's resource and what is left. The star card lists the fields as before.

## Impact
- Render: `src/render/planets/PlanetMaterial.ts`, a new shared atmosphere GLSL module, `src/render/planets/surface/*`, `src/render/map/SystemLayer.ts` and a new belt renderer.
- No rule or save change.
