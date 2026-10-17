// Falchion server (Fly.io). Serves the built client, health/info endpoints and
// the world clock: the world advances one tick (one game year) per minute and
// every connected client is told over Server-Sent Events. It is the home of the
// authoritative MMO server (change `mmo-core-systems`). Zero dependencies on
// purpose: node:http only.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(here, '..', 'dist'));
const PORT = Number(process.env.PORT ?? 8080);
const VERSION = process.env.BUILD_SHA ?? 'dev';

// One clock for server and client (the client imports the same file).
const CLOCK = JSON.parse(readFileSync(join(here, 'clock.json'), 'utf8'));
const tickAt = (ms) => Math.floor((ms - CLOCK.epochMs) / CLOCK.msPerTick);
const tickStartMs = (tick) => CLOCK.epochMs + tick * CLOCK.msPerTick;
export const clockInfo = (now = Date.now()) => {
  const tick = tickAt(now);
  return { ...CLOCK, tick, serverNow: now, nextTickAt: tickStartMs(tick + 1) };
};

// Server-Sent Events: every client hears each tick as it happens.
const listeners = new Set();
let worldTick = tickAt(Date.now());
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of listeners) res.write(msg);
}
function scheduleTick() {
  const wait = Math.max(5, tickStartMs(tickAt(Date.now()) + 1) - Date.now());
  setTimeout(() => {
    worldTick = tickAt(Date.now());
    broadcast('tick', clockInfo());
    scheduleTick();
  }, wait).unref?.();
}
// Proxies drop idle streams; a comment every 20 s keeps them open.
setInterval(() => { for (const res of listeners) res.write(': keep-alive\n\n'); }, 20_000).unref?.();

function streamTicks(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 3000\nevent: tick\ndata: ${JSON.stringify(clockInfo())}\n\n`);
  listeners.add(res);
  req.on('close', () => listeners.delete(res));
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

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
    return send(res, 200, JSON.stringify({ name: 'falchion', version: VERSION, worldTick, listeners: listeners.size }), { 'Content-Type': 'application/json' });
  }
  if (pathname === '/api/clock') return send(res, 200, JSON.stringify(clockInfo()), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (pathname === '/api/ticks') return streamTicks(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  return serveStatic(pathname, res);
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  scheduleTick();
  server.listen(PORT, () => console.log(`falchion server on :${PORT} serving ${STATIC_DIR} (${VERSION}), world year ${worldTick}, 1 year per ${CLOCK.msPerTick / 1000}s`));
}
