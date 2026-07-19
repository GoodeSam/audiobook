import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves from /audiobook/; the Tencent Cloud deployment
  // (audiobook.tumei.online) serves from the domain root — the deploy
  // script overrides via DEPLOY_BASE=/.
  base: process.env.DEPLOY_BASE || '/audiobook/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.js'],
  },
});
