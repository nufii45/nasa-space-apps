import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// base: './' so the build works at any path (Cloudflare, GitHub Pages, local preview).
// Two pages: the game (index.html) and the console kit test page (kit.html).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        kit: resolve(import.meta.dirname, 'kit.html'),
      },
    },
  },
});
