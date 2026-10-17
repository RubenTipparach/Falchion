// Falchion server (Fly.io). Today it serves the built client and health/info
// endpoints; it is the home of the authoritative MMO server (change
// `mmo-core-systems`). Zero dependencies on purpose: node:http only.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(here, '..', 'dist'));
const PORT = Number(process.env.PORT ?? 8080);
const VERSION = process.env.BUILD_SHA ?? 'dev';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

/** Which Discord features are configured (secrets are staged by CI; see discord-integration spec). */
export function discordStatus(env = process.env) {
  return {
    bot: Boolean(env.DISCORD_BOT_TOKEN),
    oauth: Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_GUILD_ID),
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

async function serveStatic(pathname, res) {
  // Resolve inside STATIC_DIR only (no path traversal).
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = resolve(STATIC_DIR, rel);
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) return send(res, 403, 'forbidden');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(STATIC_DIR, 'index.html'); // SPA fallback
  }
  try {
    const body = await readFile(file);
    const immutable = file.startsWith(join(STATIC_DIR, 'assets') + sep);
    send(res, 200, body, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
  } catch {
    send(res, 404, 'not found');
  }
}

export const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
  if (pathname === '/api/info') {
    return send(res, 200, JSON.stringify({ name: 'falchion', version: VERSION, discord: discordStatus() }), { 'Content-Type': 'application/json' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  return serveStatic(pathname, res);
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`falchion server on :${PORT} serving ${STATIC_DIR} (${VERSION})`));
}
