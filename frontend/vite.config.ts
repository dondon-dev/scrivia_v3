import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Tauri expects a fixed port during development
  server: {
    port: 5173,
    strictPort: true,
  },
  // Tauri uses a fixed port for the built app
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Produce a single index.html SPA (PocketBase serves it)
    emptyOutDir: true,
  },
  // Environment variables prefix (matches existing VITE_ convention)
  envPrefix: 'VITE_',
});
