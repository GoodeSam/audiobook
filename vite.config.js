import { defineConfig } from 'vite';

export default defineConfig({
  base: '/audiobook/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
  },
});
