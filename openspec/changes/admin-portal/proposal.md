# Proposal

## Why

With friends playing on the server, someone needs to see who is playing, reset a broken
empire, and tell everyone about maintenance.

## What Changes

- `/admin` portal for Discord ids on an allowlist read from `ADMIN_DISCORD_ID` (or
  `ADMIN_DISCORD_IDS`), comma-separated: the same secret High Frontier uses.
- Admin API: overview, player list, reset empire, announcement. Writes require a custom
  header on top of SameSite cookies.
- Public `/api/announcement`, shown in the game as a banner; an Admin link for admins.
- Sign-in returns to the page that asked for it (`?next=`, same-site paths only).

## Capabilities

### New Capabilities
- `admin-portal`: allowlisted admin dashboard, player reset and announcements.

## Impact

- `server/admin.mjs` (new), `server/auth.mjs` (`next`), `server/store.mjs` (remove, summaries, settings).
- CI stages `ADMIN_DISCORD_ID`; `docs/discord.md` admin section.
