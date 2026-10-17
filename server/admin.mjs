// Admin portal: /admin plus /api/admin/*, for Discord ids on the allowlist.
// The allowlist uses the same secret as High Frontier: ADMIN_DISCORD_ID (or
// ADMIN_DISCORD_IDS), a comma-separated list of Discord user ids.

/** Parse the admin allowlist from the environment. */
export function adminIds(env) {
  const raw = String(env.ADMIN_DISCORD_ID || env.ADMIN_DISCORD_IDS || '');
  return new Set(raw.split(',').map((s) => s.trim()).filter((s) => /^\d{5,25}$/.test(s)));
}

const MAX_ANNOUNCEMENT = 280;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function page(res, status, title, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${STYLE}</head><body>${body}</body></html>`);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function readJson(req, limit = 16_384) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

/**
 * @param {{ auth: any, store: any, admins: Set<string>, notifier?: any, info: () => object }} deps
 * @returns {(req: any, res: any, pathname: string) => Promise<boolean>} handles the request if it is an admin route
 */
export function createAdmin({ auth, store, admins, notifier, info }) {
  const isAdmin = (user) => !!user && admins.has(user.id);

  return async function handle(req, res, pathname) {
    // Public: the current announcement, shown to every player.
    if (pathname === '/api/announcement' && req.method === 'GET') {
      json(res, 200, (await store.getSetting('announcement')) ?? {});
      return true;
    }
    if (pathname !== '/admin' && !pathname.startsWith('/api/admin/')) return false;
    const user = auth.userFrom(req);

    if (pathname === '/admin') {
      if (!auth.enabled) { page(res, 503, 'Falchion admin', '<main><h1>Admin</h1><p>Discord sign-in is not configured on this server. See <code>docs/discord.md</code>.</p></main>'); return true; }
      if (!user) { res.writeHead(302, { Location: '/auth/discord?next=/admin', 'Cache-Control': 'no-store' }); res.end(); return true; }
      if (!isAdmin(user)) {
        page(res, 403, 'Falchion admin', `<main><h1>Not an admin</h1><p>Signed in as <b>${escapeHtml(user.name)}</b>. Your Discord id is <code>${escapeHtml(user.id)}</code>.</p><p>To get access, add it to the <code>ADMIN_DISCORD_ID</code> secret (comma-separated for several admins) and redeploy.</p><p><a href="/">Back to the game</a></p></main>`);
        return true;
      }
      page(res, 200, 'Falchion admin', ADMIN_HTML);
      return true;
    }

    if (!isAdmin(user)) { json(res, user ? 403 : 401, { error: 'admins only' }); return true; }
    // Writes need a custom header: a cross-site form cannot send one (CSRF guard on top of SameSite=Lax).
    if (req.method !== 'GET' && req.headers['x-falchion-admin'] !== '1') { json(res, 403, { error: 'missing admin header' }); return true; }

    if (pathname === '/api/admin/overview' && req.method === 'GET') {
      const players = await store.summaries();
      json(res, 200, { ...info(), admins: admins.size, players: players.length, you: user, announcement: (await store.getSetting('announcement')) ?? null });
      return true;
    }
    if (pathname === '/api/admin/players' && req.method === 'GET') {
      json(res, 200, await store.summaries());
      return true;
    }
    const m = /^\/api\/admin\/players\/(\d{5,25})$/.exec(pathname);
    if (m && req.method === 'DELETE') {
      const removed = await store.remove(m[1]);
      console.log(`admin ${user.id} reset empire of ${m[1]}: ${removed}`);
      json(res, removed ? 200 : 404, { removed });
      return true;
    }
    if (pathname === '/api/admin/announcement' && req.method === 'PUT') {
      try {
        const { text } = await readJson(req);
        const clean = String(text ?? '').trim().slice(0, MAX_ANNOUNCEMENT);
        const value = clean ? { text: clean, by: user.name, at: Date.now() } : {};
        await store.setSetting('announcement', value);
        if (clean && notifier?.enabled) void notifier.announcement(clean, user.name);
        json(res, 200, value);
      } catch {
        json(res, 400, { error: 'bad announcement' });
      }
      return true;
    }
    if (pathname === '/api/admin/notify-test' && req.method === 'POST') {
      if (!notifier?.enabled) { json(res, 409, { ok: false, error: 'Set DISCORD_WEBHOOK_URL (or DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID) first (docs/discord.md).' }); return true; }
      const r = await notifier.post(`✅ Falchion notifications are working (test by ${user.name}).`);
      const hint = notifier.mode === 'webhook'
        ? (r.status === 404 || r.status === 401 ? 'The webhook is gone or its URL is wrong: copy the URL again and update DISCORD_WEBHOOK_URL.' : '')
        : r.status === 403 ? 'The bot cannot post there: give it View Channel and Send Messages in that channel.'
        : r.status === 404 ? 'Channel not found: check DISCORD_CHANNEL_ID, and that the bot is in that server.'
        : r.status === 401 ? 'The bot token was rejected. DISCORD_BOT_TOKEN is the token from the Bot page (not the OAuth2 client secret); or use DISCORD_WEBHOOK_URL instead.' : '';
      json(res, r.ok ? 200 : 502, { ok: r.ok, status: r.status, error: hint || undefined });
      return true;
    }
    json(res, 404, { error: 'not found' });
    return true;
  };
}

const STYLE = `<style>
:root { color-scheme: dark; --bg: #070b16; --panel: #0d1424; --line: #24314d; --text: #dfe7f5; --muted: #8592ad; --brass: #e6b450; --chart: #7fd3e6; --bad: #ff6b6b; --good: #6ee7a8; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 20px; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 4px; }
h2 { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin: 28px 0 10px; }
a { color: var(--chart); } code { background: #121b30; padding: 1px 5px; border-radius: 4px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.card b { display: block; font-size: 20px; color: var(--brass); font-variant-numeric: tabular-nums; }
.card span { color: var(--muted); font-size: 12px; }
table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
th { color: var(--muted); font-weight: 600; font-size: 12px; }
td img { width: 22px; height: 22px; border-radius: 50%; vertical-align: middle; margin-right: 6px; }
button { background: transparent; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; }
button:hover { border-color: var(--chart); } button.danger:hover { border-color: var(--bad); color: var(--bad); }
textarea { width: 100%; min-height: 64px; background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 8px; font: inherit; }
.row { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.muted { color: var(--muted); } .ok { color: var(--good); } .err { color: var(--bad); }
.scroll { overflow-x: auto; }
</style>`;

const ADMIN_HTML = `<main>
<div class="row" style="justify-content:space-between"><div><h1>Falchion admin</h1><div class="muted" id="who"></div></div><div class="row"><a href="/">Game</a><a href="/auth/logout">Sign out</a></div></div>
<h2>Server</h2><div class="cards" id="cards"></div>
<h2>Discord channel</h2>
<p class="muted" id="notifyState"></p>
<div class="row"><button id="notifyTest">Send test message</button><span id="notifyMsg" class="muted"></span></div>
<h2>Announcement</h2>
<p class="muted">Shown as a banner to every player (up to 280 characters) and posted to the Discord channel. Empty clears it.</p>
<textarea id="ann" maxlength="280" placeholder="Server maintenance at 20:00 UTC…"></textarea>
<div class="row"><button id="annSave">Publish</button><button id="annClear">Clear</button><span id="annMsg" class="muted"></span></div>
<h2>Players</h2>
<div class="scroll"><table><thead><tr><th>Player</th><th>Discord id</th><th>Year</th><th>Colonies</th><th>Fleets</th><th>Home</th><th>Last save</th><th>Size</th><th></th></tr></thead><tbody id="players"><tr><td colspan="9" class="muted">Loading…</td></tr></tbody></table></div>
</main>
<script>
const H = { 'X-Falchion-Admin': '1', 'Content-Type': 'application/json' };
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const ago = (t) => { if (!t) return '—'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + ' s ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
async function load() {
  const o = await (await fetch('/api/admin/overview')).json();
  document.getElementById('who').textContent = 'Signed in as ' + o.you.name + ' (' + o.you.id + ')';
  const cards = document.getElementById('cards'); cards.replaceChildren();
  for (const [label, value] of [['World year', o.worldTick], ['Players', o.players], ['Connected now', o.listeners], ['Admins', o.admins], ['Version', o.version], ['Uptime', Math.round(o.uptimeSec / 60) + ' min']]) {
    const c = el('div', undefined, 'card'); c.append(el('b', String(value)), el('span', label)); cards.append(c);
  }
  document.getElementById('ann').value = o.announcement && o.announcement.text ? o.announcement.text : '';
  document.getElementById('notifyState').textContent = o.notifications
    ? 'On (' + o.notifications + '): new players, announcements, battles, colonies and depots are posted to the channel.'
    : 'Off: ' + (o.notificationsProblem || 'see docs/discord.md');
  document.getElementById('notifyTest').disabled = !o.notifications;
  const rows = await (await fetch('/api/admin/players')).json();
  const body = document.getElementById('players'); body.replaceChildren();
  if (!rows.length) { const tr = el('tr'); const td = el('td', 'No players yet.', 'muted'); td.colSpan = 9; tr.append(td); body.append(tr); }
  for (const p of rows) {
    const tr = el('tr');
    const name = el('td'); if (p.avatar) { const img = document.createElement('img'); img.src = p.avatar; img.alt = ''; name.append(img); } name.append(document.createTextNode(p.name));
    const del = el('button', 'Reset empire', 'danger');
    del.onclick = async () => {
      if (!confirm('Reset the empire of ' + p.name + '? Their save is deleted; they start again next time they play.')) return;
      const r = await fetch('/api/admin/players/' + p.id, { method: 'DELETE', headers: H });
      if (r.ok) load(); else alert('Reset failed: ' + r.status);
    };
    const act = el('td'); act.append(del);
    tr.append(name, el('td', p.id), el('td', p.year == null ? '—' : String(p.year)), el('td', String(p.colonies)), el('td', String(p.fleets)),
      el('td', p.home ? p.home.q + ', ' + p.home.r : '—'), el('td', ago(p.updatedAt)), el('td', Math.round(p.bytes / 1024) + ' KB'), act);
    body.append(tr);
  }
}
async function announce(text) {
  const msg = document.getElementById('annMsg');
  const r = await fetch('/api/admin/announcement', { method: 'PUT', headers: H, body: JSON.stringify({ text }) });
  msg.textContent = r.ok ? (text ? 'Published.' : 'Cleared.') : 'Failed: ' + r.status; msg.className = r.ok ? 'ok' : 'err';
  if (r.ok && !text) document.getElementById('ann').value = '';
}
document.getElementById('notifyTest').onclick = async () => {
  const msg = document.getElementById('notifyMsg');
  const r = await fetch('/api/admin/notify-test', { method: 'POST', headers: H });
  const b = await r.json().catch(() => ({}));
  msg.textContent = r.ok ? 'Sent: check the channel.' : 'Failed (' + (b.status || r.status) + '). ' + (b.error || '');
  msg.className = r.ok ? 'ok' : 'err';
};
document.getElementById('annSave').onclick = () => announce(document.getElementById('ann').value);
document.getElementById('annClear').onclick = () => announce('');
load().catch((e) => { document.getElementById('players').textContent = 'Failed to load: ' + e.message; });
</script>`;
