## Why
The owner: "Classic one suck... My idea of classic is like cathedrals, roman classic, art decor, decorative type
ships like in battle fleet gothic." Also: "Add another category called industrial. Ships like those found in alien."
Classic was saucers, pulp rockets and yachts, the wrong idea. There is no grimy commercial style.

## What Changes
- **Classic is rebuilt as cathedral warships:**
  - armoured prows and rams; stepped decks rising to a gothic bridge tower;
  - spires and pinnacles, flying buttresses and broadside batteries;
  - gilded trim, and an art deco or Roman variant.
  - Its plating becomes cut-stone armour blocks, carved trim bands and rows of lit lancet windows.
  - Its accent (mixed into other styles) becomes spires and buttresses.
- **A new Industrial style:** dropships, Nostromo-like tugs, a tug towing a refinery, and bulk carriers.
  - Blocky, greebled, piped, worn.
  - Its own plating: worn panels, weld seams, grilles, soot and rust streaks, warning lamps.
- **Unlocks and factions:**
  - Industrial is unlocked by a new Utilitarian node, Heavy Haulage, and can be picked at founding.
  - The Morrow corsairs fly Industrial ships.

## Impact
- **Render:** `ClassicStyle.ts`, a new `IndustrialStyle.ts`, accents, registries; hull textures `classic` (redone) and `industrial`.
- **Content:** `shipStyles.ts`; tech node `u-heavy-haulage`; the Morrow archetype's style.
- **Tools:** `build_ptex.py` graphs `hull_classic` and `hull_industrial`.
