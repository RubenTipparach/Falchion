# Proposal

## Why

With one year passing every minute (`realtime-world-clock`), income accrues around the
clock: a week away earned about 260,000 credits against ships costing ~120. Ships and
buildings appeared instantly, and fleets did nothing while the player was away.

## What Changes

- **Storage caps** per stored resource (minerals, food, goods; never credits, influence or faith), raised by each colony and by a new Warehouse building.
  Income stops at the cap; stock above it (from loot) is kept.
- **Upkeep**: every ship costs credits each year (civilian 1, warship 2, capital 8);
  Conscription still waives warship upkeep.
- **Construction takes time**: ships take years at a shipyard (by cost), buildings take
  years on their colony. Each yard and colony builds one item at a time; the cost is paid
  when queued. Queued buildings use a slot.
- **Standing orders** for fleets: auto-explore wherever on station; return home to resupply
  when nothing more can be explored there. New survey groups get both by default.

## Capabilities

### New Capabilities
- `realtime-economy`: storage caps, upkeep, construction queues and standing orders.

## Impact

- `src/core/construction/Construction.ts` (new, pure, tested); `Economy.ts` caps and upkeep.
- `src/content/buildings.ts` (years, Warehouse, STORAGE), `src/content/logistics.ts` (build years, upkeep).
- `GameController` queues, completions each year, standing orders; UI queues, caps, order toggles.
