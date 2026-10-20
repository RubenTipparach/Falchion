## Why
The owner: "how do remove stuff form queue? reorder?" A ship once queued at a yard could be neither cancelled nor moved.

## What Changes
- Each ship in a yard's queue has Build sooner, Build later and Cancel buttons.
- Cancelling refunds the cost (at today's discount) less the part already built; the ships after it move up.
- A waiting ship swaps places with its neighbour; the ship under way stays first.
- Both are server commands (`cancelJob`, `moveJob`).

## Impact
`src/core/construction/Construction.ts` (cancelJob, moveJob), `EmpireSim`, `commands.ts`, `ShipyardPanel`.
