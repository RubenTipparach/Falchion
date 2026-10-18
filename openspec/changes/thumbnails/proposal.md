## Why
Research nodes, resources, encounters, ship classes and buildings are text and flat line icons. The player wants a small rendered picture of each, made the way Star Crew Bridge Simulator makes its props and mockup shots: low-poly hard-surface models, one fixed studio camera and light, and every shot checked by eye on a contact sheet.

## What Changes
- **Skills:**
  - Falchion gains a `thumbnails` skill, adapted from Star Crew's `threejs-mockups` and `blender-hard-surface` skills.
  - It covers the studio camera and lights, building props from primitives in the hard-surface manner, and the contact-sheet check.
  - `PROVENANCE.md` records where they came from.
- **One studio** (`src/render/thumbs`):
  - One offscreen WebGL renderer with a fixed three-quarter camera and a key, fill and rim light.
  - It frames any model by its bounds and keeps each picture as a data URL.
  - It renders lazily, a few per frame, so a panel of a hundred nodes never stalls.
- **Subjects**, one registry entry per kind:
  - **ship:** the class in the player's own design, from the game's ShipFactory.
  - **building:** the surface model the planet view draws (`BUILDING_MODELS`).
  - **resource:** a prop for each of the eight resources.
  - **event:** a prop for each encounter kind.
  - **research:** each node's picture comes from what it grants:
    - a chassis: that ship;
    - a style or trait: a ship in it;
    - a part: the part;
    - a biome: the planet;
    - otherwise: its domain's emblem.
    - It stands on a plinth in its branch's colour.
- **UI:** thumbnails appear in the research node detail and tree, the shipyard class list, the planet card's buildings, resource tooltips and loot cards, and encounter cards.
- **Contact sheet:** `npm run thumbs` renders every subject into `docs/screenshots/thumbs/contact-sheet.png`, which is checked by eye before shipping.

## Impact
- New: `src/render/thumbs/*`, `src/ui/thumbs.ts`, `tools/thumbs/*`, `.claude/skills/thumbnails`.
- Wiring: `src/app/main.ts`.
- UI panels: Research, Shipyard, StarInfo, Dispatches, widgets.
- No rule, save or server change.
