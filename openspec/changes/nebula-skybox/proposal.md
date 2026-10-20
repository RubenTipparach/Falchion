# Proposal

## Why

Inside a star system the nebula looked like dark space with a blurry blob near the bottom,
not like being inside the coloured cloud the map shows there. On the sector map the nebula
also read as two unrelated cloud layers (a ~220 ly and a ~3,200 ly pattern crossfading by
zoom) instead of one nebula.

## What Changes

- The nebula is one field at every zoom: a large domain-warped field sets shape, colour and
  density everywhere; finer octaves, warped along the same clouds, only add density detail,
  and that detail grows as the view zooms in. A region keeps one hue at every scale.
- The field lives in `src/render/map/nebulaField.ts` as GLSL plus an exact TypeScript twin.
  The lattice hash is integer (`hash01` from core, top 24 bits) so CPU and GPU agree.
- System view gets a Homeworld 1-style vertex-colour skybox (`NebulaSkyboxLayer`, a new
  `MapLayer`): a 10k-vertex icosphere around the camera, coloured on the CPU from the map's
  field around the star (or around a followed ship in deep space), with seeded cloud lobes,
  a dust-laned band and a dim side. It replaces the nebula's old in-shader sky mode.
- Map nebula brightness eases with zoom (softer at galaxy scale under the disc, slightly
  dimmer at hex scale so the grid stays readable).

Extension points: a new `MapLayer` added to the `LayerStack`; the anchor (star or deep-space
point) is injected as a resolver so the layer does not depend on the galaxy model.

Out of scope: gameplay effects of nebulae; server-side use of the field.
