// Planet type audit (planetAudit.ts): starts Vite, opens tools/planets/audit.html in headless
// Chromium and writes docs/screenshots/planets/audit.jpg: every planet type in the system view and
// in the surface view from orbit, mid range and close to the ground. Look at it after changing a
// planet look or either planet shader.
//   npm run planets [-- --ids eyeball,ocean] [--tag eyeball] [--px 300] [--port 5221]
// Needs Playwright: installed globally (NODE_PATH="$(npm root -g)") or `npm i --no-save playwright`.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright not found: run with NODE_PATH="$(npm root -g)" or `npm i --no-save playwright`.');
  process.exit(1);
}

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const ids = arg('--ids');
const tag = arg('--tag');
const px = Number(arg('--px')) || 300;
const port = Number(arg('--port')) || 5221;
const out = 'docs/screenshots/planets';

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', (d) => d.toString().includes('Local:') && ok());
  vite.on('exit', (c) => fail(new Error(`vite exited ${c}`)));
});

let failed = false;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await mkdir(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 160 + 5 * (px + 8), height: 800 } });
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.error('page:', m.text()));
  page.on('pageerror', (e) => { failed = true; console.error('page:', e.message); });
  await page.goto(`http://localhost:${port}/tools/planets/audit.html?px=${px}${ids ? `&ids=${ids}` : ''}`, { timeout: 180_000 });
  await page.waitForFunction(() => window.AUDIT_READY === true, null, { timeout: 900_000, polling: 1000 });
  const file = `${out}/${tag ? `audit-${tag}` : 'audit'}.jpg`;
  await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 85, timeout: 180_000 });
  console.log('wrote', file, 'missing:', await page.locator('img.missing').count());
} finally {
  await browser.close();
  vite.kill();
}
process.exit(failed ? 1 : 0);
