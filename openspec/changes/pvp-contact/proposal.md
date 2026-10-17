## Why
Players share one galaxy, but their fleets cannot affect each other: two fleets can sit on the same hex and nothing happens. Fleets need a way to meet, and the battle has to be the server's, because the server runs every empire.

## What Changes
- **Stance:** a fleet with warships can be set Aggressive on its fleet card. Absent means passive, which is the default. Fleets without warships do not offer the stance, and the rules refuse it for them.
- **Contact:** when two players' fleets are on station on the same hex in a world year, a battle is fought if at least one is aggressive and armed. Two passive fleets pass each other. An unarmed fleet never starts a fight; if attacked it fights with everything it has, as an NPC raid's target does.
- **Battle:** the existing combat rules run with each side's warships, research bonuses and ammunition-scaled firepower. Both empires lose the ships they lost and each gets a dispatch: `<Fleet> fought <Their fleet> of <Empire> at <Star>: victory|defeat|stalemate, ...`.
- **Public view:** each fleet in another player's view carries `armed` and `stance`, both sanitised by the server.

## Out of scope
- Alliances, diplomacy, retreat, and blockades.
- Player-to-player trade or tribute.
- Choosing targets. A fleet fights whatever aggressive fleet meets it on its hex.
- Combat at colonies or planets (raids and assaults keep their own rules).
- Monetisation.

## Impact
- **Core:** `FleetOrders.stance`; `isAggressive`, `Encounter`, `startsFight` in `src/core/fleet/Presence.ts`.
- **Content:** `warshipsOf` and `hasWarships` in `src/content/logistics.ts`.
- **Sim:**
  - the orders codec carries the stance;
  - `EmpireSim.contactForce` and `applyContact` hold the per-empire part;
  - `headless.ts` gains `findContacts` and `resolveContact`.
- **Server:** `server/simTicker.mjs` resolves contacts after the year, with both empires locked in id order. `server/index.mjs` `publicView` sanitises `armed` and `stance`.
- **Client:** `publicEmpire` sends `armed` and `stance`; the fleet card gets an Aggressive chip for fleets with warships.
- **Interpretation:** the battle needs an aggressive fleet that has warships. The target may be unarmed, in which case it fights with its whole fleet (the rule NPC raids already use).
