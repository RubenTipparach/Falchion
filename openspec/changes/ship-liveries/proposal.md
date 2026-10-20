## Why
The owner wants to see ship designs in different colours and liveries. A design has three colours, but the
hull is painted one flat colour. There is no paint scheme to tell one empire's or one faction's ships apart.

## What Changes
- **Liveries:** a paint scheme on the hull in the design's secondary colour, trimmed in the accent.
  - The schemes: Plain, Two-tone, Racing stripes, Nose cap, Bands, Chevrons, Harlequin, Hazard and Tiger.
  - A pattern is laid in the ship's own frame, scaled to its hull, so it fits any style, size and proportion.
- **The design carries it** (`livery`), in the share code. `setDesign` validates it.
- **The Shipyard picks it**, beside the colours.
- **NPC factions wear their own.**
- **A showcase sheet** (`npm run thumbs -- --only livery`) shows every style in every livery and many palettes.

## Impact
- **Content:** `liveries.ts` (the table) and an NPC archetype `livery`.
- **Core:** `ShipDesign.livery`, normalised, encoded.
- **Sim:** the `setDesign` codec.
- **Render:** the hull shader paints the livery; `bakeShipSpace` gives it the hull's bounds.
- **UI:** the Shipyard's Livery row.
- **Thumbs:** the `livery` kind and its sheet.
