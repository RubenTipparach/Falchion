// Posts game news to one Discord channel. Zero dependencies. Two ways in (docs/discord.md):
// a channel webhook (DISCORD_WEBHOOK_URL, no bot token needed) or the bot
// (DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID). Inert until one is set; the webhook wins.

/** What players may report, and how it reads in the channel. */
export const EVENT_KINDS = {
  battle: '⚔️',
  colony: '🪐',
  depot: '🛰️',
};

/** A Discord channel webhook URL (Channel → Edit Channel → Integrations → Webhooks). */
export const WEBHOOK_URL = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d{5,25}\/[\w-]+$/;

/** Sliding-window counter: at most `max` hits per key in `windowMs`. */
function limiter(max, windowMs, now) {
  const hits = new Map();
  const live = (key) => (hits.get(key) ?? []).filter((t) => now() - t < windowMs);
  return {
    ok: (key) => live(key).length < max,
    hit: (key) => hits.set(key, [...live(key), now()]),
  };
}

/**
 * @param {{ webhookUrl?: string, token?: string, channelId?: string, api?: string, fetchImpl?: typeof fetch, now?: () => number, perHour?: number,
 *           publicUrl?: string, mentionsPerSender?: number, mentionsPerRecipient?: number }} opts
 */
export function createNotifier(opts) {
  const {
    api = 'https://discord.com/api/v10', fetchImpl = fetch, now = () => Date.now(), perHour = 12,
    publicUrl = 'https://falchion.fly.dev', mentionsPerSender = 10, mentionsPerRecipient = 6,
  } = opts;
  // Secrets pasted with a stray space or newline still work.
  const webhookUrl = opts.webhookUrl?.trim(), token = opts.token?.trim(), channelId = opts.channelId?.trim();
  const mode = webhookUrl && WEBHOOK_URL.test(webhookUrl) ? 'webhook'
    : token && channelId && /^\d{5,25}$/.test(channelId) ? 'bot' : null;
  const enabled = mode !== null;
  /** Why notifications are off, naming the setting to fix; null when on. */
  const problem = enabled ? null
    : webhookUrl ? 'DISCORD_WEBHOOK_URL is set but is not a Discord webhook URL (https://discord.com/api/webhooks/...).'
    : token && !channelId ? 'DISCORD_BOT_TOKEN is set; DISCORD_CHANNEL_ID is missing.'
    : !token && channelId ? 'DISCORD_CHANNEL_ID is set; DISCORD_BOT_TOKEN is missing on the server (check the GitHub secret name, then redeploy).'
    : token && channelId ? 'DISCORD_CHANNEL_ID must be the channel\'s numeric id (right-click the channel → Copy Channel ID).'
    : 'Set DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID, or DISCORD_WEBHOOK_URL (see docs/discord.md).';
  const recent = new Map(); // player id -> timestamps of their reports this hour
  // Chat mentions: per sender and per recipient, each an hour long.
  const bySender = limiter(mentionsPerSender, 3_600_000, now);
  const byRecipient = limiter(mentionsPerRecipient, 3_600_000, now);
  const dmChannels = new Map(); // discord user id -> DM channel id

  /** Post a message; never pings anyone. Returns { ok, status }. */
  async function post(content) {
    if (!enabled) return { ok: false, status: 0 };
    try {
      const body = { content: String(content).slice(0, 1900), allowed_mentions: { parse: [] } };
      const res = mode === 'webhook'
        ? await fetchImpl(`${webhookUrl}?wait=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, username: 'Falchion' }),
        })
        : await fetchImpl(`${api}/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      if (!res.ok) console.error(`discord notify failed: ${res.status}`);
      return { ok: res.ok, status: res.status };
    } catch (err) {
      console.error('discord notify failed:', err.message);
      return { ok: false, status: 0 };
    }
  }

  /** Keep a player's own reports to `perHour` an hour so the channel stays readable. */
  function allow(playerId) {
    const t = now();
    const list = (recent.get(playerId) ?? []).filter((x) => t - x < 3_600_000);
    if (list.length >= perHour) { recent.set(playerId, list); return false; }
    list.push(t);
    recent.set(playerId, list);
    return true;
  }

  /** Plain text from a player: one line, no markdown links or code blocks, bounded. */
  const clean = (s, max) => String(s ?? '').replace(/[\r\n`]+/g, ' ').replace(/\]\(/g, '] (').replace(/\s+/g, ' ').trim().slice(0, max);

  async function call(path, body) {
    const res = await fetchImpl(`${api}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res;
  }

  /** A direct message from the bot (only reaches users who share a server with it and allow DMs). */
  async function dm(userId, content) {
    try {
      let channel = dmChannels.get(userId);
      if (!channel) {
        const res = await call('/users/@me/channels', { recipient_id: userId });
        if (!res.ok) return false;
        channel = String((await res.json()).id ?? '');
        if (!/^\d{5,25}$/.test(channel)) return false;
        dmChannels.set(userId, channel);
      }
      const res = await call(`/channels/${channel}/messages`, { content: content.slice(0, 1900), allowed_mentions: { parse: [] } });
      if (!res.ok) dmChannels.delete(userId);
      return res.ok;
    } catch (err) {
      console.error('discord dm failed:', err.message);
      return false;
    }
  }

  /** A channel post that pings exactly one user and nobody else. */
  async function ping(userId, content) {
    if (mode !== 'bot') return false; // a webhook cannot ping a user; this needs the bot and its channel
    try {
      const res = await call(`/channels/${channelId}/messages`, { content: `<@${userId}> ${content}`.slice(0, 1900), allowed_mentions: { users: [userId] } });
      return res.ok;
    } catch (err) {
      console.error('discord ping failed:', err.message);
      return false;
    }
  }

  return {
    enabled,
    /** 'webhook', 'bot', or null when off. */
    mode,
    problem,
    post,
    /** Players can be told about chat mentions (needs the bot token; the channel is the fallback). */
    canNotifyPlayers: Boolean(token),
    /**
     * Tell a player who is not in the game that someone mentioned them in chat (or sent them a
     * direct message). A DM from the bot first; else a channel post pinging only them. A private
     * message never has its text posted in the channel. Rate-limited per sender and per recipient.
     * Returns 'dm', 'channel' or false.
     * @param {{ from: { id: string, name: string }, to: string, text: string, private?: boolean }} m
     */
    async mention({ from, to, text, private: isPrivate = false }) {
      if (!token || !/^\d{5,25}$/.test(String(to)) || to === from.id) return false;
      if (!bySender.ok(from.id) || !byRecipient.ok(to)) return false;
      bySender.hit(from.id);
      byRecipient.hit(to);
      const who = `**${clean(from.name, 64)}**`;
      const link = publicUrl.replace(/\/$/, '');
      const line = clean(text, 300);
      const verb = isPrivate ? 'sent you a message' : 'mentioned you';
      if (await dm(to, `${who} ${verb} in Falchion: ${line} — ${link}`)) return 'dm';
      const pub = isPrivate ? `${who} sent you a direct message in Falchion — ${link}` : `${who} mentioned you in Falchion: ${line} — ${link}`;
      return (await ping(to, pub)) ? 'channel' : false;
    },
    joined: (name, empire) => post(empire
      ? `🚀 **${clean(name, 64)}** founded the **${clean(empire, 40)}** in the galaxy.`
      : `🚀 **${clean(name, 64)}** founded an empire in the galaxy.`),
    announcement: (text, by) => post(`📣 **Announcement** (${clean(by, 64)}): ${clean(text, 280)}`),
    /** A player's own news (battle, colony, depot). Returns false when unknown or rate-limited. */
    async report(player, kind, text) {
      if (!enabled || !(kind in EVENT_KINDS)) return false;
      const line = clean(text, 200);
      if (!line || !allow(player.id)) return false;
      return (await post(`${EVENT_KINDS[kind]} **${clean(player.name, 64)}**: ${line}`)).ok;
    },
  };
}
