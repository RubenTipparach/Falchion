## Why
Players share one galaxy. They need to recognise each other's empires at a glance and make their own feel theirs: a name, a ruler, a capital, a colour and a flag. Every empire should also start on equal footing.

## What Changes
- A founding screen for a new empire (and for existing saves without an identity):
  - empire name (with suggestions), ruler title and name, capital world name;
  - empire colour;
  - flag designer: pattern, emblem and three colours, plus a random flag.
- The identity is part of the save, on the server for signed-in players, so it follows them to every device. It is editable later from the top bar or the Empire panel.
- Your territory, fleets, routes, ship accents and selection outline take the empire colour.
- Other players see your empire's name, colour and flag on the map. The server validates and bounds that public view, and clients validate flag parts against their own tables.
- The Discord channel announces new empires by name: the server save starts only once the empire is founded.
- Every empire starts with one star system (its home, settled on three worlds); territory grows with colonies.
- Fleet speed: every empire starts at 1 ly per minute. Ship classes no longer have their own speeds; only drive research adds speed.

## Impact
- New: `src/core/empire/Identity.ts`, `src/content/heraldry.ts`, `src/render/flag.ts`, `src/ui/Founding.ts`.
- Changed: `GameState.identity` and the save, `World` claims, `TerritoryLayer.setOwn`, `ServerSync`, `server/index.mjs` public view, notifier join message.
