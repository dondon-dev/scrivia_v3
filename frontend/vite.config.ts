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

  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,

    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },

    allowedHosts: [
      'scriviapayroll.com',
      'www.scriviapayroll.com',
      'api.scriviapayroll.com',
      'localhost',
      '127.0.0.1',
    ],

    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
  },

  envPrefix: 'VITE_',
});