## Why
The owner: "how about mega structure worlds? like ringworlds, dyson swarm, spheres, kardashov thrusters etc? can you come up with a few more epic mega structures type planets? there should be less than a few hundred of these in the galaxy". Also: "mega structure worlds have nothing but the star and megastructure in it. No asteroids, comets, nothing. Since the creators spent every last atom building whatever mega structure they were building".

## What Changes
- **Eleven megastructures** (`src/content/megastructures.ts`), each built round stars that can host it:
  - Ringworld;
  - Dyson Swarm;
  - Dyson Sphere;
  - Stellar Engine (a Shkadov thruster);
  - Matrioshka Brain;
  - Alderson Disk;
  - Star Lifter;
  - Nicoll-Dyson Beam;
  - Penrose Sphere (black holes);
  - Neutron Forge (neutron stars and pulsars);
  - Topopolis.
- **Placement** (`src/core/galaxy/Megastructures.ts`): about 200 sites from the galaxy seed, the same for everyone, with a quota per type.
  - Sites follow the stars.
  - They keep 300 ly apart and 600 ly clear of where empires start.
  - Each takes only a star that never had planets, so no colony or home is displaced.
- **A megastructure system holds the star and the structure, nothing else.**
  - The structure is the system's one world (`planetsOf`).
  - It has no asteroid fields (`fieldsOf`).
  - Surveying it gives a great one-time cache and shows science.
  - It cannot be settled or landed on.
- **System view:** a procedural build per type round the star (`src/render/megastructures/MegaVisuals.ts`). Hulls are lit by the star; beams, plasma and circuitry glow.
- **Galaxy map:** each megastructure is a beacon in its type's colour, named when zoomed in. Clicking it opens the structure.
- **Search:** a Megastructures group. Megastructure-only queries come from the site list, so they find structures at any distance.
- **Card and thumbnail:** the planet card describes the structure. Its portrait is the build itself.
- **The audit sheet** (`npm run planets`) adds every megastructure: system view, close, edge on, and thumbnail.

## Impact
- **Core:**
  - `GalaxyModel` (`starAt` marks megastructure systems; `megastructures()`; `startHex`);
  - `Megastructures.ts`, `Planets.ts`, `Asteroids.ts`, `GalaxySearch.ts`.
- **Content:** `megastructures.ts`, plus biomes and resources (yields and science).
- **Render:**
  - `MegaVisuals.ts`, `MegaBeaconLayer`, `SystemLayer`;
  - `PlanetThumbnails` and thumbnail subjects;
  - the audit.
- **UI and app:**
  - the search panel and the planet card;
  - follow distance and no landing (`GameController`); `World.ts` uses `startHex`.
