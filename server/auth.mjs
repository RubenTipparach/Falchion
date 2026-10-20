// Discord sign-in (OAuth2 authorization-code flow, scope `identify` only) with a
// signed session cookie. Zero dependencies: node:crypto and the global fetch.
// Inert until DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and SESSION_SECRET are set.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'fal_session';
const STATE_COOKIE = 'fal_oauth_state';
const NEXT_COOKIE = 'fal_next';

/** Where to land after sign-in: a same-site path only (never another origin). */
// Same-site paths only; commas and percent-escapes for hotlinks like /system/-14697,20078/Norka_II.
export const safeNext = (next) => (typeof next === 'string' && /^\/(?![/\\])[\w\-./?=&,%]*$/.test(next) ? next : '/');
const SESSION_DAYS = 30;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, { maxAge, secure }) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

/**
 * @param {{ clientId?: string, clientSecret?: string, sessionSecret?: string, publicUrl?: string,
 *           discordApi?: string, discordAuthorize?: string, fetchImpl?: typeof fetch, now?: () => number }} opts
 */
export function createAuth(opts) {
  const {
    clientId, clientSecret, sessionSecret, publicUrl = 'http://localhost:8080',
    discordApi = 'https://discord.com/api/v10', discordAuthorize = 'https://discord.com/oauth2/authorize',
    fetchImpl = fetch, now = () => Date.now(),
  } = opts;
  const enabled = Boolean(clientId && clientSecret && sessionSecret);
  const secure = publicUrl.startsWith('https://');
  const redirectUri = `${publicUrl.replace(/\/$/, '')}/auth/discord/callback`;

  const sign = (payload) => b64url(createHmac('sha256', sessionSecret).update(payload).digest());

  /** Session value: base64url(JSON) + "." + HMAC. */
  function issue(user) {
    const payload = b64url(JSON.stringify({ ...user, exp: now() + SESSION_DAYS * 86_400_000 }));
    return `${payload}.${sign(payload)}`;
  }

  /** The signed-in player for a request, or null. */
  function userFrom(req) {
    if (!enabled) return null;
    const raw = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!raw) return null;
    const [payload, mac] = raw.split('.');
    if (!payload || !mac) return null;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return typeof user.id === 'string' && user.exp > now() ? { id: user.id, name: user.name, avatar: user.avatar ?? null } : null;
    } catch {
      return null;
    }
  }

  /** GET /auth/discord: send the player to Discord, with a CSRF state cookie. */
  function login(res, next = '/') {
    const state = b64url(randomBytes(18));
    const url = new URL(discordAuthorize);
    url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'identify', redirect_uri: redirectUri, state, prompt: 'none' }).toString();
    res.writeHead(302, { Location: url.toString(), 'Set-Cookie': [cookie(STATE_COOKIE, state, { maxAge: 600, secure }), cookie(NEXT_COOKIE, safeNext(next), { maxAge: 600, secure })], 'Cache-Control': 'no-store' });
    res.end();
  }

  /** GET /auth/discord/callback: check state, exchange the code, read the user, start a session. */
  async function callback(req, res, url) {
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
    const clearState = cookie(STATE_COOKIE, '', { maxAge: 0, secure });
    if (!code || !state || !expected || state !== expected) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Set-Cookie': clearState });
      return res.end('Sign-in failed: the request did not match. Go back and try again.');
    }
    try {
      const tokenRes = await fetchImpl(`${discordApi}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      });
      if (!tokenRes.ok) throw new Error(`token exchange ${tokenRes.status}`);
      const token = await tokenRes.json();
      const meRes = await fetchImpl(`${discordApi}/users/@me`, { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!meRes.ok) throw new Error(`users/@me ${meRes.status}`);
      const me = await meRes.json();
      // Only the id, display name and avatar are kept (spec: discord-integration).
      const user = { id: String(me.id), name: me.global_name || me.username || 'Commander', avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null };
      const next = safeNext(parseCookies(req.headers.cookie)[NEXT_COOKIE]);
      res.writeHead(302, { Location: next, 'Set-Cookie': [clearState, cookie(NEXT_COOKIE, '', { maxAge: 0, secure }), cookie(SESSION_COOKIE, issue(user), { maxAge: SESSION_DAYS * 86_400, secure })], 'Cache-Control': 'no-store' });
      res.end();
    } catch (err) {
      console.error('discord sign-in failed:', err.message);
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Set-Cookie': clearState });
      res.end('Sign-in with Discord failed. Try again in a moment.');
    }
  }

  function logout(res) {
    res.writeHead(302, { Location: '/', 'Set-Cookie': cookie(SESSION_COOKIE, '', { maxAge: 0, secure }), 'Cache-Control': 'no-store' });
    res.end();
  }

  return { enabled, redirectUri, userFrom, login, callback, logout, issue };
}
