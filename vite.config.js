import { defineConfig } from 'vite';

export default defineConfig({
  base: '/audiobook/',
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
