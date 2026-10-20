---
name: procedural-geometry
description: Rules and tools for building procedural three.js meshes in Falchion (ship styles, traits, ShipKit primitives, planets, any custom BufferGeometry). Use before adding or changing a ship style, trait, part or primitive, or when a part renders dark, see-through, inside-out or lit from the wrong side.
---

# Procedural geometry: no inverted faces

An inverted part is wound clockwise as seen from outside, so three.js culls the faces you should
see and shows the inside: it looks dark, hollow or see-through. Its normals may point inward too,
so light comes from the wrong side.

## Tools (src/render/geometry/orientation.ts)
- `orientation(geo)` → `{ outward, normals }`, each in [-1, 1]. `outward` is the signed volume
  over the unsigned volume (sign is what matters: inverted parts read about -1, correct ones
  positive, thin tubes and tori only slightly positive). `normals` is how well the vertex normals
  agree with the winding.
- `makeOutward(geo)` flips the winding (and normals) when a part is inside-out, then recomputes
  normals that disagree with the winding.
- `isSolid(mesh)`: closed, opaque, single-sided parts. Glows, planes, discs, rings and
  double-sided materials have no inside and are skipped.

## Guarantees already in place
- `ShipKit.lathe` calls `makeOutward`: LatheGeometry's winding depends on the profile's point
  order, and profiles written front to back (or top to bottom) used to come out inside-out
  (for example the classic saucer).
- `ShipFactory.create` runs `makeOutward` on every solid part of every finished ship, so any new
  style or trait is safe by default.
- `src/render/geometry/orientation.test.ts` builds every style across seeds, sizes and all traits
  and fails on any solid part with `outward <= 0` or disagreeing normals. Run `npm test`.

## Rules when adding geometry
1. Prefer ShipKit primitives (`lathe`, `cyl`, `box`, `sphere`, `tube`) and `addMirrored`.
   Mirroring by negative object scale is fine: three.js flips culling for negative determinants.
2. Never mirror by scaling a geometry itself (`geometry.scale(-1, 1, 1)`): it inverts winding with
   no compensation. Use object scale or `addMirrored`. If you must, call `makeOutward` after.
3. Custom `BufferGeometry` (indices you write yourself): wind counter-clockwise seen from
   outside, then `computeVertexNormals()`, then check with `orientation()` in a test.
4. Flat or open decorations (sails, glows, fins as planes) should use `side: DoubleSide` or a
   transparent material so they read from both sides; they are exempt from the check.
5. When a part looks wrong in the game, first add its style/seed to the orientation test: a
   failing test pins the bug before you fix it.
