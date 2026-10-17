import { defineConfig } from 'vitest/config';

// FALCHION_SERVER=http://localhost:8080 npm run dev: the dev client talks to a local Falchion
// server (sign-in, saves, commands, chat), as the deployed client does.
const server = process.env.FALCHION_SERVER;

export default defineConfig({
  base: './',
  server: server ? { proxy: { '/api': { target: server, changeOrigin: false }, '/auth': { target: server, changeOrigin: false } } } : undefined,
  build: { chunkSizeWarningLimit: 1500 },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.mjs'] },
});
