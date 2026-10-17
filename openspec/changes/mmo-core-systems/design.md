# Design

## Context

Builds on `galaxy-mockup-foundation`. `src/core` is already pure and deterministic, so
the server reuses it directly. See proposal.md for scope.

## Goals / Non-Goals

**Goals:** authoritative server, async + lockstep time, PvE combat, expansion, economy, Discord.
**Non-Goals:** PvP, monetisation, matchmaking.

## Decisions

- **Server**: Node + TypeScript, imports `src/core`. Event-sourced: commands → validated
  → events persisted; state derived. Alternative: snapshot-only DB — rejected, replays
  and lockstep audit need the event log.
- **Time — extension point `TimeAuthority`**: `AsyncTimeAuthority` schedules events on a
  priority queue by game time; `LockstepTimeAuthority` owns a zone and advances on
  all-orders-in or timeout. Entities are assigned to exactly one authority; zone
  detection uses hex distance over a spatial hash of fleets.
- **Combat — extension point `Ability` registry**: round-based resolver
  `(fleets, seed) → BattleLog`; abilities hook `onTargetSelect`, `onDamage`, `onRoundEnd`.
  Integer HP and damage.
- **Economy — extension point `IncomeSource` registry**: planets, trade, religion, politics,
  espionage each implement `yield(state, day)`.
- **Biomes**: data table with adjacency list; research nodes grant biome unlocks.
- **Discord**: `IdentityProvider` (Discord OAuth / Embedded App SDK `authorize` +
  token exchange on the server) and `Notifier` (bot DMs, channel webhooks).
  The client depends only on the interfaces; a `MockIdentityProvider` serves local dev.
  Follow the proven High Frontier setup: one-click "Connect Discord" uses OAuth scopes
  `identify` + `guilds.join` to silently add the player to the bot's guild (bots can only
  DM users they share a guild with); a manual user-id fallback works with just the bot
  token. Features switch on per configured secret (`DISCORD_BOT_TOKEN` → DMs; client id +
  secret + guild id → OAuth), staged to Fly by CI, so an unconfigured deploy is inert.
- **Hosting**: the server runs on Fly.io (`server/`), the static client on GitHub Pages;
  persistence adds a Fly volume with a single-writer machine (as High Frontier does).

## Risks / Trade-offs

- [Lockstep stalls on idle players] → turn timer with hold-position default.
- [Long async horizons make balance hard] → simulation harness running years of game time headless.
- [Discord API changes] → isolated behind `IdentityProvider`/`Notifier`.
