// Contact sheet of every thumbnail (the `thumbnails` skill): starts Vite, opens
// tools/thumbs/sheet.html in headless Chromium and writes docs/screenshots/thumbs/contact-sheet.png
// (or one PNG per kind with --split). Look at the result before shipping a change to a model.
//   npm run thumbs [-- --only resource,event] [--split]
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
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const split = args.includes('--split');
const port = 5199;
const out = 'docs/screenshots/thumbs';

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', (d) => d.toString().includes('Local:') && ok());
  vite.on('exit', (c) => fail(new Error(`vite exited ${c}`)));
});

let failed = false;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await mkdir(out, { recursive: true });
  const kinds = split ? (only ?? 'resource,event,building,ship,research').split(',') : [only];
  for (const kind of kinds) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', (m) => m.type() === 'error' && (failed = true, console.error('page:', m.text())));
    page.on('pageerror', (e) => { failed = true; console.error('page:', e.message); });
    await page.goto(`http://localhost:${port}/tools/thumbs/sheet.html${kind ? `?only=${kind}` : ''}`);
    await page.waitForFunction(() => window.THUMBS_READY === true, null, { timeout: 180_000 });
    const file = `${out}/${kind && split ? kind : 'contact-sheet'}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log('wrote', file, 'missing:', await page.locator('figure.missing').count());
    await page.close();
  }
} finally {
  await browser.close();
  vite.kill();
}
process.exit(failed ? 1 : 0);
