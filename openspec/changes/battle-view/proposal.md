## Why
Battles at sea between players are fought one round a world year, but a player only sees a line in
the dispatches and a banner on the fleet card. The approved Battle Theatre mockup showed the fight
itself: both fleets in formation, every weapon and every loss on screen, health bars over the ships
and a fleet strength meter that says who is winning. This change brings that view into the game.

## What Changes
- The round log of a battle at sea gains a breakdown a client can draw: per side the ships lost and
  the ships boarded by class, the damage dealt by doctrine, the jamming and flak factors, each
  class's hull points and the damage each class group carries at the end of the round. The rules
  and results of `resolveRound` are unchanged; ammunition is not part of the log.
- A fleet's `FleetBattle` keeps the last round as a `BattleRecord` (`src/core/combat/BattleRecord.ts`),
  oriented with that fleet first: both fleets going into the round (ships and carried damage), the
  breakdown, and each fleet's strength when the battle began. It is small plain data, saved with the
  fleet and published in the public view so anyone who sees the battle can watch it. The server
  bounds it (`publicView`); clients check it again (`cleanBattleRecord`).
- Loadouts accept `damage` (hull points carried by each class group), the contract for damage that
  carries between rounds; health bars are drawn from it.
- A battle view (`src/render/battle`): a `MapLayer` that covers the map, like the planet surface
  view, and replays the latest round across the world year it was fought in, then the next round
  when the server's state brings it. A pure, seeded script (`BattleScript.ts`) schedules who fires
  at whom and when, kill shots so every loss has a visible cause, boarding pods, repair beams and
  jamming, and gives each ship's health over the round. Ships are the game's own ship meshes from
  the ShipFactory, instanced; effects take four draw calls.
- A HUD (`src/ui/BattleHud.ts`): the fleet strength meter top centre, a health bar over every ship,
  fleet labels and callouts, and a dock with the round, the range band, the countdown, Retreat for
  your own fleet and Back. Esc leaves the view.
- Entry points: a Watch battle button on the battle banner of your fleet card and on another
  player's fleet in battle, and a pulsing red hex with a crossed-swords marker and the round number
  on the map for every battle you can see (`BattleMarkerLayer`).

## Extension points
- `MapLayer` (`covers`/`overlay`, from planet-surface-view): the battle view and the markers are two
  new layers in the `LayerStack`; nothing else in the map changes.
- Ship looks come from the registered `ShipStyleGenerator`s through `ShipFactory`; another empire's
  classes are drawn in its style and colours with `classDesign` (`src/core/ships/ClassDesign.ts`).
- Weapon effects are chosen per class from the `WEAPON` table of the script; a new class only
  needs an entry there (unknown classes fire bolts).

## Out of scope
- Replaying earlier rounds (only the latest round is kept), NPC raids and planetary assaults.
- The rules change that makes damage carry between rounds (the loadout field is read, not written here).
