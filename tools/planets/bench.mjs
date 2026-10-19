// Surface frame-time bench (planetBench.ts): starts Vite, opens tools/planets/bench.html in headless
// Chromium and prints, per planet type, the globe's bake time and the close-up's frame time at a
// close and a ground pose, with and without flora. Headless Chromium renders on the CPU
// (SwiftShader), so compare runs with each other: before and after a change, on the same machine.
//   npm run planets:bench [-- --ids jungle,bones] [--px 640] [--port 5223]
import { spawn } from 'node:child_process';
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
const port = Number(arg('--port')) || 5223;
const query = new URLSearchParams({ ...(arg('--ids') ? { ids: arg('--ids') } : {}), ...(arg('--px') ? { px: arg('--px') } : {}) });

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', (d) => d.toString().includes('Local:') && ok());
  vite.on('exit', (c) => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page:', e.message));
  page.on('console', (m) => (m.type() === 'error' ? console.error('page:', m.text()) : m.type() === 'log' && console.log(m.text())));
  await page.goto(`http://localhost:${port}/tools/planets/bench.html?${query}`, { timeout: 180_000 });
  await page.waitForFunction(() => window.BENCH, null, { timeout: 1_800_000, polling: 1000 });
  const bench = await page.evaluate(() => window.BENCH);
  console.table(bench);
} finally {
  await browser.close();
  vite.kill();
}
