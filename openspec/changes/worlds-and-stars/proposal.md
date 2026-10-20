## Why
The galaxy has nine planet types and seven main-sequence star classes in made-up proportions. The owner wants about twice as many kinds of world, each with its own look and use, and stars that match what the Milky Way is really made of: binaries, white and brown dwarfs, giants, neutron stars and pulsars, stellar black holes, and a supermassive black hole at the centre.

## What Changes
- **Twelve new planet types (21 in all).** Barren is renamed Cratered: it is the Moon/Mercury type.

  | id | Type | Like | Notes |
  |---|---|---|---|
  | `hazy` | Shrouded world | Venus, Titan | Thick atmosphere, the surface hidden |
  | `eyeball` | Eyeball world | tidally locked | Day-side ocean ringed by ice, night side frozen; only round dim stars, close in |
  | `rust` | Dust world | Mars | Thin atmosphere, red dust, polar caps |
  | `swamp` | Swamp world | | Shallow murky water, mist |
  | `storm` | Storm world | | Endless storms, lightning on the night side |
  | `choir` | Choir world | | Dormant machines still broadcast a fragment of an older instruction, and it doesn't quite match yours |
  | `ecumenopolis` | City world | Coruscant | One planet-wide city: capitals of advanced (tier 4-5) civilisations, never natural |
  | `magma` | Magma world | | Molten crust, close to its star; cannot be settled |
  | `acid` | Acid world | | Glowing acid seas |
  | `aurora` | Aurora world | | Strong magnetic field, auroras round both poles; common round flaring dwarfs and pulsars |
  | `bones` | Bone world | | Giant skeletons of creatures the size of mountain ranges |
  | `deadtech` | Dead machine world | | A technologically dead civilisation's machines, rusting |

- **Existing worlds do not change.** A planet's old roll is kept; a second, separate roll may *refine* it into a related new type (desert into dust, jungle into swamp, toxic into acid or shrouded, ocean round a red dwarf into eyeball...). Colonised worlds keep the type they were settled as. Settling, explored results and saves are unaffected.
- **Each type has yields, settle rules and a look.** New types get yields (`BIOME_YIELDS`); the dead machine and choir worlds also give science. Magma worlds cannot be settled; city worlds can only be taken. Choir worlds show their broadcast fragment on the planet card.
- **Realistic stars.**
  - Main-sequence classes by number as in the solar neighbourhood: M 76%, K 12%, G 7.6%, F 3%, A 0.6%, B 0.13%, O rare. O and B stars are young, so they are more common in the spiral arms.
  - Also: brown dwarfs, white dwarfs (about 8% locally), giants (more in the old bulge), neutron stars, pulsars and stellar black holes (about 1% and 0.1%).
  - Binaries and triples by mass: about 25% of M dwarfs, 50% of Sun-like stars, 80%+ of O/B stars.
  - The galactic centre holds a supermassive black hole (like Sagittarius A*, about 4 million solar masses).
  - Quasars are the active cores of distant galaxies, not objects inside one. The central black hole is drawn active, with jets, as the nearest thing.
- **A star's type no longer comes from the same dice as its planets.** The planet count is unchanged; remnants (neutron stars, black holes) only replace systems that had no planets.
- **Rendering:**
  - Each new planet look in the system view and in thumbnails, with new shader features: tidal locking, auroras, lightning, glowing seas and city or machine patterns.
  - Each star kind drawn as itself: dwarfs, giants, pulsar beams, black holes with an accretion disc and photon ring, binary companions.

## Impact
- Content: `biomes.ts` (12 types, refinements), `planetLooks.ts`, `resources.ts` (yields), choir broadcasts.
- Core: `Planets.ts` (refinement), `GalaxyModel.ts` (star kinds, companions, the central black hole), `Economy.ts` (biome science), settle rules.
- Sim: planet overrides (colonies keep their type; advanced NPC capitals are city worlds).
- Render: `PlanetMaterial.ts`, `SystemLayer.ts` (stars), `NearStarLayer.ts`. UI: star and planet cards.
