# Discord sign-in: setup guide

Falchion uses **Discord** to sign players in. Your friends open
**https://falchion.fly.dev**, click **Sign in with Discord**, and found their own empire
in the same galaxy as you:

- Each player's empire is saved **on the server** (it follows them between devices).
- Everyone shares the realtime world clock (one year per minute).
- You see each other's territory and fleets on the map. PvP is on.
- Discord shares only the player's **user id, display name and avatar**. Falchion asks for
  the `identify` scope and nothing else: no email, no servers, no messages.

Without sign-in the game runs as a **guest**,
saved in that browser only.

You need to do this once. It takes about five minutes.

## 1. Create the Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and
   click **New Application**. Name it `Falchion` and create it.
2. In the left menu open **OAuth2**.
3. Copy the **Client ID**.
4. Under **Client Secret** click **Reset Secret** and copy the secret. You will not see it
   again; reset it if you lose it.
5. Under **Redirects** click **Add Redirect** and enter exactly:

   ```
   https://falchion.fly.dev/auth/discord/callback
   ```

   For local testing, also add `http://localhost:8080/auth/discord/callback`.
6. Click **Save Changes**.

No bot, no Discord server and no testers list are needed: any Discord user can sign in.

## 2. Make a session secret

The server signs the sign-in cookie with a secret only it knows. Any long random string
works, for example:

```sh
openssl rand -base64 32
```

## 3. Add three GitHub secrets

In the repository: **Settings → Secrets and variables → Actions → New repository
secret**. Add:

| Name | Value |
|---|---|
| `DISCORD_CLIENT_ID` | the Client ID from step 1 |
| `DISCORD_CLIENT_SECRET` | the Client Secret from step 1 |
| `SESSION_SECRET` | the random string from step 2 |
| `ADMIN_DISCORD_ID` | optional: your Discord user id(s), comma-separated (see Admin portal) |

## 4. Deploy

Push any commit (or re-run the latest **Deploy** workflow). The Fly job then:

- copies the three secrets onto the Fly app (**Sync Discord secrets to Fly**);
- keeps the app on **one machine**, because saves live on one disk;
- creates the **`falchion_data` volume** (1 GB, mounted at `/data`) on first deploy.

Check `https://falchion.fly.dev/api/info`: it should say `"discord": true`.

If the job warns that it could not set secrets or scale (the deploy token may not be
allowed to), do it once from your machine with [flyctl](https://fly.io/docs/flyctl/):

```sh
fly secrets set -a falchion DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... SESSION_SECRET=...
fly scale count 1 -a falchion
```

## 5. Invite your friends

Send them **https://falchion.fly.dev**. They click **Sign in with Discord**, approve, and
land in their new empire. Each new player's home is placed 60–260 ly from the original
starting system, so friends start within an hour or two of each other at base speed.
**Sign out** is under your name in the top-right corner.

## Admin portal

**https://falchion.fly.dev/admin**: server overview, every player (year, colonies,
fleets, last save) with a **Reset empire** button, and an **announcement** banner shown
to all players.

Access uses the same secret as High Frontier: add a GitHub secret **`ADMIN_DISCORD_ID`**
holding your Discord user id. For several admins, separate ids with commas
(`123456789012345678,234567890123456789`); `ADMIN_DISCORD_IDS` also works. Redeploy
after changing it.

To find your id, sign in and open `/admin`: the "Not an admin" page shows it. Or, in
Discord, turn on **Settings → Advanced → Developer Mode**, then right-click your name →
**Copy User ID**.

## Channel notifications

Falchion posts game news to one channel in your Discord server: new players founding an
empire, admin announcements, battle results, new colonies and supply depots. It never
pings anyone, and each player's reports are limited to 12 an hour.

### Easiest: a channel webhook (no bot token)

1. In Discord: the channel → **Edit Channel → Integrations → Webhooks → New Webhook**.
   Name it *Falchion* if you like, then **Copy Webhook URL**.
2. Add the GitHub secret `DISCORD_WEBHOOK_URL` with that URL and redeploy.
3. Open `/admin` and click **Send test message**.

Anyone with the URL can post to that channel, so keep it secret like a password.

### Or: as the bot

Use this if you want the posts to come from the bot user itself.

1. **Add the bot to your server** (once): Developer Portal → your app → **OAuth2 → URL
   Generator**, tick the **bot** scope and **View Channels** + **Send Messages**, open
   the URL, pick the server and authorize.
2. **Bot token**: app → **Bot** → **Reset Token**. This is *not* the OAuth2 client
   secret: the two are different values, and Discord rejects the client secret here.
   Discord only shows a bot token once, so if you never copied it you have to reset it
   (resetting does not affect sign-in).
3. **Channel id**: Discord **Settings → Advanced → Developer Mode**, then right-click the
   channel → **Copy Channel ID**.
4. Give the bot *View Channel* and *Send Messages* in that channel.
5. GitHub secrets `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID`, redeploy, then **Send test
   message** in `/admin`.

If both are set, the webhook is used. When the test fails, `/admin` says why (missing
permission, wrong channel id, rejected token, deleted webhook).

## In-game chat and @mentions

Signed-in players have a **Chat** tab: a global channel, private direct messages, and the
list of players online right now (anyone with the game open). Guests are asked to sign in.

- **Location links**: names of stars and planets you know (your home, colonies, explored
  systems, depots, fleet destinations, other players' homes) become links when you send
  them. Click one to fly there. Player names link to their home.
- **@mentions**: type `@` to pick a player. If they are **not in the game**, the bot tells
  them on Discord: "**Name** mentioned you in Falchion: … — https://falchion.fly.dev". A
  direct message to someone who is away does the same.

Notifications need the bot token (`DISCORD_BOT_TOKEN`, see *Channel notifications*):

- The bot sends a **Discord DM**. Discord only allows that when the player **shares a
  server with the bot** (invite the bot to your community server) and accepts DMs from
  server members.
- If the DM fails and `DISCORD_CHANNEL_ID` is set, the bot posts in that channel and pings
  **only that player**. Direct-message text is never posted there, only "sent you a direct
  message".
- Each sender triggers at most 10 notifications an hour, and each player receives at most 6.

Chat keeps the last 300 global messages and 200 per conversation in the server database (`/data/falchion.db`).
Each player may send 5 messages every 10 seconds.

## Other players and the galaxy feed

Signed-in players have a **Players** tab:

- **Empires**: every empire in the galaxy with its flag, ruler, Discord name, who is online
  now (green dot), colony systems, fleets, when they were last seen and how far their home is
  from yours. Locate a home or any of their fleets (double-click zooms in), or click **DM** to
  open a private chat. Clicking an empire's name on the map opens it here.
- **Galaxy feed**: what everyone is doing, newest first: empires founded, colonies settled,
  supply depots, battles, systems fully surveyed, and players coming and going. Star names are
  links that fly the camera there. News from other players also pops up briefly at the bottom
  of the map.

Other players' fleets and territory update **within seconds**: each save is pushed to
everyone else over the same live connection as chat (a move order, colony, depot or founding
is saved within a moment; other changes at most every 10 seconds). Each player may report at
most 20 events every 10 minutes; battles, colonies and depots still go to the Discord channel
(12 an hour) as before.

## Running it locally

```sh
npm run build
DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... SESSION_SECRET=... \
PUBLIC_URL=http://localhost:8080 node server/index.mjs
```

Open http://localhost:8080 (the redirect from step 1.5 must include the localhost URL).
Saves go to `./data/` (ignored by git).

## Troubleshooting

| You see | Fix |
|---|---|
| No sign-in screen, the game starts as a guest | Sign-in is off: check `/api/info` shows `"discord": true` and the three secrets are set. Use the Fly URL (https://falchion.fly.dev). |
| Discord says **Invalid OAuth2 redirect_uri** | The redirect in step 1.5 must match `https://falchion.fly.dev/auth/discord/callback` exactly. |
| "Sign-in failed: the request did not match" | The sign-in took more than 10 minutes, or cookies are blocked. Try again. |
| Everyone was signed out | `SESSION_SECRET` changed. Sign in again; saves are kept. |
| Progress lost after a deploy | The volume is missing: run `fly volumes list -a falchion` and check one `falchion_data` volume exists and one machine runs. |

## What the server stores

One file per player at `/data/<discord id>.json`: their Discord id, name and avatar, the
saved empire, and a public view (home, colony stars, fleets) that other players receive
from `/api/players`. Stockpiles, research and orders are never sent to other players.
Chat history is in the server database (`/data/falchion.db`); direct messages are only ever sent to the two
players in them. The galaxy feed (the last 300 events) is in `/data/activity.json`.

## Not built yet

- Launching Falchion as a **Discord Activity** inside a voice channel.

It is in the `mmo-core-systems` OpenSpec change.
