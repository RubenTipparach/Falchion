// Posts game news to one Discord channel through a channel webhook. Zero dependencies.
// Inert until DISCORD_WEBHOOK_URL is set (docs/discord.md).

/** What players may report, and how it reads in the channel. */
export const EVENT_KINDS = {
  battle: '⚔️',
  colony: '🪐',
  depot: '🛰️',
};

/** A Discord channel webhook URL (Channel → Edit Channel → Integrations → Webhooks). */
export const WEBHOOK_URL = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d{5,25}\/[\w-]+$/;

/**
 * @param {{ webhookUrl?: string, fetchImpl?: typeof fetch, now?: () => number, perHour?: number }} opts
 */
export function createNotifier(opts) {
  const { webhookUrl, fetchImpl = fetch, now = () => Date.now(), perHour = 12 } = opts;
  const enabled = Boolean(webhookUrl && WEBHOOK_URL.test(webhookUrl));
  const recent = new Map(); // player id -> timestamps of their reports this hour

  /** Post a message; never pings anyone. Returns { ok, status }. */
  async function post(content) {
    if (!enabled) return { ok: false, status: 0 };
    try {
      const res = await fetchImpl(`${webhookUrl}?wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: String(content).slice(0, 1900), username: 'Falchion', allowed_mentions: { parse: [] } }),
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

  return {
    enabled,
    post,
    joined: (name) => post(`🚀 **${clean(name, 64)}** founded an empire in the galaxy.`),
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
