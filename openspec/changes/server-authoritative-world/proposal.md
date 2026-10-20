## Why
Falchion is meant to be an MMO, but every empire's simulation runs in its owner's browser:
- the server only stores saves;
- an empire stops while its owner is away, then catches up (at most a week) on return;
- a player could save any state they like;
- players cannot affect one another, because nobody holds the shared truth.

## What Changes
- The game rules move out of the browser controller into a pure, deterministic `EmpireSim`
  (`src/sim/`): state plus commands plus the yearly step, with no three.js or DOM. The controller
  becomes a view on top of it.
- The server runs `EmpireSim` for every signed-in empire, every tick (one minute), online or
  offline. Empires keep producing, building, surveying and travelling while their owners sleep.
- Clients send orders as commands (`POST /api/command {name, args}`). The client applies a command
  at once for responsiveness; the server applies it to its own copy, and its result is the truth.
  After each command and each tick the server sends the owner its authoritative state.
- Saves are written by the server only. A client save is accepted once, to start a new empire, and
  never again.
- Stage 3 (later change): player-versus-player interaction (fleets meeting, combat, trade) on top of
  the shared server state.

## Impact
- New: `src/sim/EmpireSim.ts` (rules), `src/sim/serverEntry.ts`, a server bundle built with Vite
  SSR into `server/sim/` (Docker and CI build it), `/api/command`, owner `state` events.
- Changed: `GameController` extends `EmpireSim` and keeps only view logic. The client's save sync
  becomes command sync for signed-in players. Guests still simulate locally.
