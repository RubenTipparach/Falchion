## Shared world
`SharedWorld { tick, npcs: Record<id, NpcState>, asteroids: Record<fieldId, { left, at }> }`.
- **What it holds:** only activated NPCs and touched fields. Everything else is implied by the catalogue: an untouched field is full, and an undiscovered NPC is dormant.
- **How empires change it:** an empire's simulation reads a snapshot and emits `SharedEffect`s (discover, mined, npcFleet, npcColony). The holder applies them in order:
  - the server under a `world` lock, after the empire's own save is written;
  - a guest browser at once.

## Ticks (server)
Each world year:
1. **World step.** Under the world lock, step the NPC world with every empire's fleets and colonies. This builds and moves raiders and resolves contact, producing a list of battle and raid events, one per empire.
2. **Empire step.** Each empire, under its own lock, takes its events, then plays its year. That covers mining (drawing on the world snapshot), discovery and everything else, and emits effects.
3. **Apply and broadcast.** Effects are applied to the world, which is saved and broadcast (`world` event).

## NPC catalogue (pure, from the galaxy seed)
- **Grid NPCs:** a cell every 900 ly holds one NPC with a chance that rises with star density, about 300 in all. The id is `c:i,j`.
- **Spawn NPCs:** 2–3 at 25–90 ly from a player's home. The id is `s:q,r:n`, from the home hex.
- **Generation:** from its id, an NPC's archetype, name, colour, home star, 0–2 colony stars, tier (1–5, rising toward the core) and garrisons are regenerated identically everywhere.

## NPC behaviour (pure, seeded by NPC id and year)
- **Raiders:** an active NPC keeps up to `tier + 1` raider fleets, built every `12 − tier` years from its archetype's ship pool. Idle raiders at home raid, with the archetype's aggression per year, the nearest colony or fleet of an empire that knows them, within 150 ly. They then return home.
- **Contact:** an NPC fleet in the same hex as a player fleet fights it, using the whole fleet with ammunition-scaled firepower. One that reaches a colony system without defenders steals 8% of credits, metals and food, capped. Every outcome reaches both sides.

## Mining
- **Fields:** `fieldsOf(star)` gives 0–3 fields: resource, capacity of 150–900 by richness, and id `starId#n`.
- **Yield:** a mining ship of a class that mines resource X yields `3 × (3 + mining bonus) × (1 + mining%)` a year from the system's fields of X, never more than they hold.
- **Refill:** a field refills linearly to full over 1,440 years.
