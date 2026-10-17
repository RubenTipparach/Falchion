## Why
Any player could declare war on, or ally with, any other player in the galaxy, even one on the far side of it. As in Civilization V, two empires should be able to deal only once they have physically met.

## What Changes
- **What counts as meeting:** two players meet (first contact) when a fleet or world of one comes within `CONTACT_RANGE` (2 hexes) of a fleet or world of the other.
  - Fleets count on station and under way.
  - Worlds are the home and the colonies.
- **Detection:** the server checks for first contacts every world year from every empire's public view, and records each new contact in the shared world (`contacts`).
- **Diplomacy needs contact:** no diplomatic action between players who have not met.
  - The shared world ignores such an action.
  - The empire refuses the order and says why.
  - Pairs that already had a relation from before this change count as met.
- **News:**
  - both players get "First contact with X" in their next year;
  - the contact is recorded in the event log.
- **UI:**
  - Empire › Relations lists only the players you have met, and counts the ones you have not;
  - the Players panel tags unmet players "Not met".

## Impact
- **Core:**
  - `src/core/diplomacy/Diplomacy.ts`: `CONTACT_RANGE`, `haveMet`, `firstContacts`;
  - `SharedWorld` gets `contacts` and a `contact` effect.
- **Sim:**
  - headless `findFirstContacts`;
  - `EmpireSim` `hasMet`, `unmetEmpires` and first-contact news;
  - diplomacy is refused before contact.
- **Server:** the ticker applies first contacts before fights.
- **UI:** the Relations tab and the Players panel.
