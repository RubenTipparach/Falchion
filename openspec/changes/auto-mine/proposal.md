## Why
Asteroid fields run dry and take 24 real hours to refill. A mining fleet that has emptied its field sits idle until its owner notices and sends it somewhere else by hand, and in a realtime world the owner is usually away.

## What Changes
- **Auto-mine standing order.** Fleets with mining ships get an "Auto-mine" order, next to Auto-explore and Return to resupply, on the fleet card and in the Fleets panel. It is shown only for fleets that have mining ships.
- **Moving on when dry.** Each world year, a fleet on station with the order whose miners have nothing left to mine where they are moves on. This covers a system with no field of their resource, or one whose fields of it are all below a small threshold. The fleet goes to the nearest system within 80 ly that has a field of that resource with enough left. At equal distance it prefers the one with more left, then the lower star id, so the choice is deterministic. The empire is told "<Fleet> heads to <Star> to mine <resource>".
- **Shared depletion counts.** The search reads the shared world, so fields that other empires have mined dry count as dry. Fleets in transit are left alone.
- **A command like every order.** `setOrders` carries the flag through its codec. The server applies it and plays the move each year. Trade runs and the other orders are kept, and orders from older saves or browsers without the flag read as off.

## Impact
- **New:**
  - `src/core/fleet/AutoMine.ts`: the pure, deterministic search, as a ring scan from the fleet like the survey planner.
  - Tests in `src/core/fleet/automine.test.ts` and `src/sim/automine.test.ts`.
- **Changed:**
  - `FleetOrders.autoMine`.
  - The `orders` codec in `src/sim/commands.ts`.
  - `EmpireSim.setOrders`, which stores the flags the same way in the browser and on the server.
  - `EmpireSim.followOrders`.
  - `StarInfoPanel` and `FleetsPanel` order chips.
