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
  // Hosted deploys inject PORT and proxy a custom domain onto the container.
  // Without these two lines the server binds 5173 and rejects the proxy host,
  // which is exactly how the first v0.7.0 deploy failed (port 3000 not
  // listening after 60 s). Keep it: `npm run dev` and `npm run preview` then
  // work locally (PORT unset -> 5173 / 4173) and behind the proxy alike.
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.PORT),
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4173,
    strictPort: Boolean(process.env.PORT),
    allowedHosts: true,
  },
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
    coverage: {
      provider: 'v8',
      // No HTML report: this environment's safe-delete shim refuses to clear a
      // directory with >50 files, and a fresh HTML report has ~60. The JSON
      // summary carries every number the docs quote.
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      // "Core" is the engine that decides what the app draws and how it is
      // scored — every file that can turn a cut document into paper, judge it,
      // or hand it to the model. React pages/components are covered by
      // structural render tests but counted separately: line coverage of JSX is
      // dominated by markup branches that carry no behaviour.
      include: [
        'src/geometry/**/*.ts',
        'src/puzzle/**/*.ts',
        'src/ai/schema.ts',
        'src/ai/prompt.ts',
        'src/ai/draft.ts',
        'src/ai/templates.ts',
        'src/ai/client.ts',
        'src/ai/cloudConfig.ts',
        'src/services/export.ts',
        'src/services/storage.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/tests/**'],
    },
  },
});
