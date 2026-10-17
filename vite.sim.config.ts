import { defineConfig } from 'vite';

/**
 * The game rules for the server: src/sim/headless.ts bundled into one Node module,
 * server/sim/headless.mjs, which server/simTicker.mjs runs once a world year to keep
 * every away empire playing. `npm run build:sim`.
 */
export default defineConfig({
  build: {
    ssr: 'src/sim/headless.ts',
    outDir: 'server/sim',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: { output: { format: 'es', entryFileNames: 'headless.mjs' } },
  },
  // One self-contained file: the server has no node_modules.
  ssr: { noExternal: true },
});
