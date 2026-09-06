import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// This repository is a monorepo: the web app lives in frontend/. Hostinger's
// Git-based deployment runs `npm run build` at the REPOSITORY ROOT and then
// publishes the `dist/` directory it produces. The root therefore does not
// have its own src/ tree (that stale copy was removed when the app moved to
// frontend/), so a plain root build would fail on index.html's /src/main.tsx.
//
// Instead, treat frontend/ as the Vite project root and hoist the build
// output back up to ./dist at the repository root for Hostinger to publish.
export default defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  envPrefix: 'VITE_',
});
