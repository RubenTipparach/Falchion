# Proposal

## Why

Friends should be able to sign in and play in the same galaxy. Until now identity was a
local mock and every empire lived in one browser's storage.

## What Changes

- Discord OAuth2 sign-in on the Fly server (`identify` scope only), with a CSRF state
  cookie and a signed, HttpOnly session cookie. Inert until three secrets are set.
- Per-player saves on the server (`/api/save`), one JSON file per Discord id on a Fly
  volume (single machine, one writer). The client also keeps a local copy and uses
  whichever save is further along.
- A shared galaxy: each signed-in player gets their own home 60–260 ly from the original
  start; `/api/players` returns other players' public view (home, colony stars, fleets),
  drawn as territory and fleets on the map.
- Sign-in screen with a guest option (browser-only saves); static hosting stays guest.
- CI stages the Discord secrets onto Fly and keeps one machine; `docs/discord.md` guide.

## Capabilities

### New Capabilities
- `discord-sign-in`: sign-in, server-side saves, other players in the shared galaxy.

## Impact

- `server/auth.mjs`, `server/store.mjs` (new, zero-dependency, tested), `server/index.mjs` routes.
- `server/fly.toml` (volume, PUBLIC_URL, DATA_DIR), `.github/workflows/deploy.yml`.
- `src/app/identity.ts`, `src/app/ServerSync.ts`, `src/ui/SignIn.ts`, `World.ts` (per-player home),
  `SaveGame` slots, `TerritoryLayer.setDynamic`, other players' fleets in `GameController`.
