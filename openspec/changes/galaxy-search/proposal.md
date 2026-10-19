## Why
The owner: "do you have a search window for finding planets by name? or type, or stars by type?" and "is there anyway
for you to search for unexplored planets across the galaxy?". Finding a world today means panning the map. Every
star and planet is a pure function of the galaxy seed and its hex, and planet types already show on any star you
open, so a search reveals nothing new. It only finds things faster.

## What Changes
- **Search panel** (top bar, or `/`).
  - **Query:** text (star or planet name), planets or stars, planet types, star kinds and spectral classes.
  - **Status:** any, unsurveyed, surveyed, settled or free.
  - **Origin:** the view's centre or home.
- **How it finds them:** the scan walks hex rings outward from the origin (nearest first, about 3 million hexes a
  second). It runs in time slices, so the game stays smooth. It stops at a result limit or a radius. Search further
  extends it.
- **Results:** nearest first, with their distance, type and status, and Go to and Copy link.
- **Pure core:** `GalaxyScan` (`src/core/galaxy/GalaxySearch.ts`), resumable and deterministic, with tests.

## Impact
- **Core:** `GalaxySearch.ts`.
- **UI:** `SearchPanel`, a top bar tab and the `/` key.
- **App:** `GameQueries.viewHex`.
