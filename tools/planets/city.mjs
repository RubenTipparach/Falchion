// City shots (cityShots.ts): starts Vite, opens tools/planets/city.html in headless Chromium and
// writes docs/screenshots/planets/city.jpg (or city-<tag>.jpg): a capital and a city world by day
// and night, from an overview, street level and close. Look at it after changing towers, streets,
// traffic, people or lamps.
//   npm run planets:city [-- --tag after] [--port 5227]
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
const port = Number(arg('--port')) || 5227;
const tag = arg('--tag');
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
  const page = await browser.newPage({ viewport: { width: 1620, height: 800 } });
  page.on('pageerror', (e) => { failed = true; console.error('page:', e.message); });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  await page.goto(`http://localhost:${port}/tools/planets/city.html`, { timeout: 180_000 });
  await page.waitForFunction(() => window.CITY_READY === true, null, { timeout: 1_200_000, polling: 1000 });
  const file = `${out}/${tag ? `city-${tag}` : 'city'}.jpg`;
  await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 85, timeout: 180_000 });
  console.log('wrote', file);
} finally {
  await browser.close();
  vite.kill();
}
process.exit(failed ? 1 : 0);
