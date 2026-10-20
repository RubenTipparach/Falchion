---
name: thumbnails
description: Make, change and check Falchion's rendered thumbnails (research nodes, resources, events/encounters, ship classes, buildings) - one three.js studio with a fixed three-quarter camera and key, fill and rim light, low-poly hard-surface props built from primitives the CSG way (block out, carve, union overlapping solids, chamfer only edges that catch light), a registry of subjects, lazy rendering, and a contact sheet checked by eye. Adapted from Star Crew Bridge Simulator's threejs-mockups and blender-hard-surface skills. Use when adding a thumbnail kind or prop, changing a model a thumbnail shows, or when a thumbnail looks wrong ("thumbnail", "icon render", "prop", "contact sheet", "image for the building/tech/ship").
---

# Thumbnails

The owner, 2026-10-17: "Grab some 3d rendering skills from star crew bridge simulator and start
rendering thumbnails for research, minerals, events, ships, and buildings." The design is
`openspec/changes/thumbnails`. This skill is how the studio works and how to add to it.

## The parts

| File | What it is |
| --- | --- |
| `src/render/thumbs/ThumbStudio.ts` | The one offscreen renderer. Fixed camera and lights, frames a model by its bounding sphere, caches each picture as a data URL, renders queued requests a few per frame. |
| `src/render/thumbs/subjects.ts` | The registry: one `ThumbKind` (`ship`, `building`, `resource`, `event`, `research`) to a builder `(id) => THREE.Object3D`. Ships come from `ShipFactory`, buildings from `BUILDING_MODELS`, so a thumbnail always matches the game. |
| `src/render/thumbs/propKit.ts` | Primitives for hand-made props: `prism` (an extruded profile, chamfers drawn into the profile), `obox`, `hull` (convex hull of points), `lathe`, `crystal`, `ring`, and the colour `ROLES`. Every solid passes `makeOutward`. |
| `src/render/thumbs/props.ts` | The props: one per resource, encounter kind and research domain emblem and ship part. |
| `src/ui/thumbs.ts` | What panels call: `thumb(kind, id, size)` returns an `<img>` that fills in when rendered. `src/app/main.ts` connects it to the studio; without one (tests) it is an empty placeholder. |
| `src/render/thumbs/contactSheet.ts`, `tools/thumbs/sheet.html`, `tools/thumbs/shoot.mjs` | The contact sheet: every subject in a grid, captured by headless Chromium (SwiftShader) into `docs/screenshots/thumbs/contact-sheet.png`, or one PNG per kind with `--split` (`npm run thumbs -- --split [--only ship,research]`). Needs Playwright: `NODE_PATH="$(npm root -g)"` with a global install, or `npm i --no-save playwright`. |
| `nodes/*.ts`, `ships/*.ts`, `buildings/art.ts` | Hand-made art: one prop per research node (by domain), one hull per ship class (`ShipArt = (colors) => Group`, nose +z, painted primary/secondary/accent), one showpiece per building. `props.test.ts` fails, naming the file, when an id has none. Use `--domain hulls` or `--only ship --ids a,b --tag x` to shoot just a slice. |
| `STAT_PROPS` in `props.ts` | A research bonus's stat to the prop that shows it (speed shows a fusion torch, mining a drill, barrage a missile rack), so bonus nodes are not all their domain's emblem. |

## The studio (from threejs-mockups)
- **One camera, one light rig, for every subject.** A 30 degree lens from the front-right, about 25 degrees
  above the horizon. A warm key light from the upper left and front, a cool hemisphere fill, and a blue rim light
  from behind. A thumbnail never brings its own camera or lights: consistency is what makes a row of them read as a set.
- **No shadow maps, no post-processing.** They cost a frame on a phone and fail on SwiftShader, which the contact
  sheet is shot with.
- **Transparent background.** The panel's CSS gives the tile its backdrop (a dark radial vignette), so one picture
  works on every panel.
- **Frame by bounds.** The studio fits the bounds, so a 2 km dreadnought and a 4 m farm are the same size
  on screen. A prop's own scale is free.
- **Ships stand nose left, banked.** A hull seen nose-on is a dart; turned about 60 degrees across the line of sight and rolled to show its top deck, its length and plan read. The studio fits the bounding box's corners, not a sphere, so a long hull fills the tile.
- **Render lazily.** A request for an uncached picture queues it. The studio renders at most a few a frame (a
  research tree asks for 150). A cached picture returns at once.
- **Deterministic.** A model with a seed uses a fixed seed (the class id, the node id), never `Math.random`, so a
  picture is the same every run and the contact sheet diffs.

## Props, the CSG way (from blender-hard-surface)
Star Crew models props in Blender with Boolean cutters. Falchion has no Blender, so the same discipline is done
with three.js primitives:

| The shape | Make it with |
| --- | --- |
| A body whose side view says it all (an ingot, a crate, a plinth) | One extruded profile (`prism`) |
| A curve (a coin, a dome, a canister) | `lathe`: the profile swept, the segment count sets the facets |
| A tapered or leaning block (a crystal, a shard, rubble) | `hull` of its corner points: planar faces by construction |
| Pieces that meet | Overlap them by a few percent of their size (a union): no face may lie on another (z-fighting) |

- **Low poly, flat shaded.** A prop is 50 to 400 triangles. Facets are the look; smoothing a 12-sided lathe makes it
  read as a blob at 64 px.
- **Chamfer only the edges that catch light**, and draw the chamfer into the profile (one more vertex) rather than
  bevelling everything: a blanket bevel triples the count and softens the silhouette.
- **Colour by role** (`ROLES`: hull, trim, accent, glow, dark), plus the subject's own colour (the resource's
  colour, the branch colour) for the part that says what it is. Glows use `MeshBasicMaterial` and are exempt from
  the outward check.
- **The silhouette must say it at 48 px.** Test by shrinking the contact sheet: an ingot stack, a crystal cluster,
  a coin pile. Details smaller than a twentieth of the prop vanish; leave them out.
- **Every solid faces outward** (the `procedural-geometry` skill). `props.test.ts` builds every subject and fails on
  an inside-out solid.

## Add a thumbnail
1. A new building, ship class, resource, encounter kind or tech node in `src/content` needs nothing else when its
   model exists. A new building needs its surface model in `BUILDING_MODELS` (its test already says so). A new
   resource or encounter kind needs a prop in `props.ts` (`props.test.ts` fails until it has one).
2. A new kind of subject: add a `ThumbKind` and its builder to `subjects.ts`, and a row to the contact sheet.
3. `npm run thumbs`, then **look at the contact sheet** (Read the PNG). A black tile, a prop off centre, a part
   inside out, two props that look the same: fix and reshoot. A thumbnail you have not looked at is not done.
4. Send the contact sheet to the owner with the change.
