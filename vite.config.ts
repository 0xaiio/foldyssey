import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the built bundle works from any static host sub-path.
  base: './',
  // Keep every cache inside the project: some sandboxed shells deny writes to
  // the OS temp directory, which makes Vitest's SSR module cache fail (EPERM).
  cacheDir: 'node_modules/.vite-cache',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Files are loaded serially: in a sandboxed shell the module runner races
    // on its temp cache when several workers start at once (EPERM), which
    // silently drops test files from the run. The suite is fast enough (<1s).
    fileParallelism: false,
  },
});
