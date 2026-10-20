// Keeping the server responsive however hard a client (or a script) hits it: token-bucket rate
// limits per client, a cap on open live streams per client, and short caches for the reads that
// cost the most. Zero dependencies.

/**
 * Token buckets by key: each holds up to `capacity` requests and refills `perSecond`. A burst can
 * spend the whole bucket; after that, requests are allowed at the refill rate.
 * @param {{ capacity: number, perSecond: number, now?: () => number, maxKeys?: number }} o
 */
export function createRateLimiter({ capacity, perSecond, now = () => Date.now(), maxKeys = 50_000 }) {
  /** @type {Map<string, { tokens: number, at: number }>} */
  const buckets = new Map();
  return {
    /** Spend `cost` from the key's bucket: 0 when allowed, else the seconds until it would be. */
    take(key, cost = 1) {
      const t = now();
      let b = buckets.get(key);
      if (!b) {
        // A full map drops its oldest buckets (Map keeps insertion order): they were full anyway, or soon.
        if (buckets.size >= maxKeys) for (const k of buckets.keys()) { buckets.delete(k); if (buckets.size < maxKeys * 0.9) break; }
        b = { tokens: capacity, at: t };
        buckets.set(key, b);
      }
      b.tokens = Math.min(capacity, b.tokens + ((t - b.at) / 1000) * perSecond);
      b.at = t;
      if (b.tokens >= cost) {
        b.tokens -= cost;
        return 0;
      }
      return Math.max(1, Math.ceil((cost - b.tokens) / perSecond));
    },
    get size() {
      return buckets.size;
    },
  };
}

/**
 * A value worked out at most once every `ttlMs`; callers that arrive while it is being worked out
 * share that one computation. `invalidate` drops it at once (the data changed).
 * @template T
 * @param {{ ttlMs: number, compute: () => Promise<T>, now?: () => number }} o
 */
export function createCached({ ttlMs, compute, now = () => Date.now() }) {
  /** @type {{ at: number, value: Promise<T> } | null} */
  let entry = null;
  return {
    /** @returns {Promise<T>} */
    get() {
      if (entry && now() - entry.at < ttlMs) return entry.value;
      const value = compute();
      const mine = { at: now(), value };
      entry = mine;
      // A failure is not kept: the next caller tries again.
      value.catch(() => { if (entry === mine) entry = null; });
      return value;
    },
    invalidate() {
      entry = null;
    },
  };
}

/** Counts open connections (live streams) per key, refusing past `max`. */
export function createConnectionCap(max) {
  /** @type {Map<string, number>} */
  const open = new Map();
  return {
    /** Claim a connection: a release function, or null when the key already has `max` open. */
    claim(key) {
      const n = open.get(key) ?? 0;
      if (n >= max) return null;
      open.set(key, n + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (open.get(key) ?? 1) - 1;
        if (left > 0) open.set(key, left);
        else open.delete(key);
      };
    },
  };
}

/**
 * Who a request comes from, for limits: the signed-in player, else the client's address (Fly puts
 * it in Fly-Client-IP; a proxy in the first X-Forwarded-For entry).
 * @param {import('node:http').IncomingMessage} req
 * @param {{ id: string } | null} user
 */
export function clientKey(req, user) {
  if (user?.id) return `u:${user.id}`;
  const fly = req.headers['fly-client-ip'];
  const fwd = req.headers['x-forwarded-for'];
  const ip = (typeof fly === 'string' && fly) || (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}
