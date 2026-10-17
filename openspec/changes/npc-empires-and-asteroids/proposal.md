## Why
- **NPCs are scenery.** Every player gets five private neighbours: two aliens and three fake "players". Their fleets only move for show, and the War Room has four fixed targets. Nothing fights back, and no two players share an NPC.
- **Mining is free.** Mining ships mine whatever a system's planets hold, forever, at a flat rate.

## What Changes
- **A shared world.** A new state the whole galaxy shares, held and run by the server (guests keep their own). It holds the NPC empires that have been discovered and the asteroid fields that have been mined. Empires change it only through effects their simulation emits (discovered, mined, fought), which the server applies under one lock.
- **NPC empires everywhere, alive once discovered.**
  - A deterministic catalogue: 2–3 NPC empires near every player's home, and a few hundred across the galaxy, denser toward the core and stronger inward. Each is regenerated from its id: archetype, name, colours, home, colony worlds and tier.
  - An NPC is not simulated until a player's fleet comes within range of its territory. From then on it builds raiding fleets that go after the empires that know it. Spawn NPCs are known from the start.
  - Discovered NPCs show on the map with their territory and fleets, the same for every player.
- **Combat with NPCs.**
  - NPC raiders that reach a player's fleet fight it, and ones that reach an undefended colony system steal resources.
  - The War Room lists the worlds of the NPCs you know; raiders at home defend their capital. Attacking needs a fleet at the target, and a captured world becomes your colony.
  - The server resolves every battle with the existing deterministic combat rules. Both sides keep the outcome.
- **Asteroid fields.**
  - Systems have 0–3 asteroid fields, each holding one resource. Mining ships mine only asteroid fields, at three times the old rate.
  - Fields deplete and refill fully over 24 real hours (1,440 world years). Depletion is shared: everyone mining a field draws on the same rocks.
  - Star cards show each field's resource, what is left and when it refills.
- **Old scenery removed.** The fake neighbouring "players", their cosmetic fleets and the fixed War Room targets are retired. NPC worlds become markets for trade goods.

## Impact
- **New:**
  - `src/core/world/SharedWorld.ts`: the shared state and its effects.
  - `src/core/galaxy/Asteroids.ts`.
  - `src/core/npc/NpcCatalog.ts` and `src/core/npc/NpcSim.ts`.
  - `src/content/npcs.ts`: archetypes.
  - Server: `world.json` and `/api/world`.
- **Changed:**
  - `EmpireSim`: discovery, mining, battles, War Room targets and engage.
  - `headless.ts`: shared world in, effects out.
  - Server ticker and commands: the world lock, the NPC step, battle delivery.
  - Client: shared world from the server, NPC map layers, star card, War Room.
  - `World.ts`: neighbours become spawn NPCs.
