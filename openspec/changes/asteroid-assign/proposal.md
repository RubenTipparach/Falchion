## Why
The owner: "please let me click on each asteroid so I can assign mining ships to them!". Today mining is per system. Every miner at a star draws on all its fields of their resource, fullest first, and the field card can only send the dock's idle miners to another system.

## What Changes
- **Assign miners to a field.** Clicking a belt opens its card. The card lists every group of miners of that field's resource, the dock and each fleet, with where each one is. Assign sends a group there.
  - A fleet sets course for the field's star.
  - The dock's miners leave as a new flotilla.
- **The rule.**
  - A fleet's order `mineField` makes its miners, on station at that star, mine that field alone while it has rock.
  - The system's other miners leave it be and work the other fields.
  - Once the field is dry, the fleet mines the system's other fields, and an auto-mining fleet moves on as before.
  - The order is kept when other orders change.
- **Command:** `mineField(fleetId, fieldId)` is validated on the server like every order.
- **Feedback.**
  - The belt glows under the pointer and while its card is open.
  - A fleet's card names the field it was sent to, linking to that field's card.

## Impact
- **Core:** `FleetOrders.mineField`.
- **Sim:** `EmpireSim.mineField`, with field pools in `presence` and `drawFields`; the `mineField` command.
- **UI:** the field card's miner list, and the fleet card's field line.
- **Render:** `AsteroidBelt.setHighlight`, and `SystemLayer` field hover and selection.
