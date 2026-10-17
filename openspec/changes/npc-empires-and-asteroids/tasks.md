## 1. Shared world
- [ ] 1.1 SharedWorld state, effects and their application (pure, tested)
- [ ] 1.2 Server: world.json, /api/world, the world lock, effects applied after each empire write, `world` broadcast
- [ ] 1.3 Client: shared world from the server (guests local), applied to the map and panels

## 2. Asteroid mining
- [ ] 2.1 Asteroid fields per system (deterministic) and refill over 24 h
- [ ] 2.2 Mining ships mine only asteroid fields, faster, drawing them down (shared)
- [ ] 2.3 Star card: fields, what is left, refill time

## 3. NPC empires
- [ ] 3.1 Archetypes (content) and the catalogue: spawn NPCs and grid NPCs, regenerated from ids
- [ ] 3.2 Discovery: fleets within range activate an NPC; spawn NPCs known from the start
- [ ] 3.3 NPC world step: raider fleets, raids, contact battles (deterministic)
- [ ] 3.4 Battles and raids delivered to empires; War Room targets from known NPCs; engage effects
- [ ] 3.5 Map: known NPC territories and fleets; retire the fake neighbours, cosmetic fleets and fixed targets

## 4. Checks
- [ ] 4.1 Tests: catalogue determinism, discovery, mining and refill, NPC step and battles, server/client agreement
- [ ] 4.2 End to end: discovery, a raid, a War Room battle, a depleted field
