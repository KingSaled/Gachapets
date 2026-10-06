/**
 * Self-contained demo build: one HTML file with the game server, SQLite
 * (asm.js), fonts and sprites all inlined, for hosting as a static artifact.
 *   npm run build:demo   →   client/dist-demo/index.html
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const shim = (f: string) => fileURLToPath(new URL(`./src/demo/shims/${f}`, import.meta.url));

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    'import.meta.env.VITE_DEMO': JSON.stringify('1'),
  },
  resolve: {
    alias: {
      'node:events': shim('events.ts'),
      'node:crypto': shim('crypto.ts'),
      'node:util': shim('util.ts'),
    },
  },
  build: {
    outDir: 'dist-demo',
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 20_000,
  },
});
