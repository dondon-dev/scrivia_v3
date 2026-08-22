import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['exceljs', 'file-saver'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Only split third-party modules; keep app code in the main chunk.
          if (!id.includes('node_modules')) return undefined;

          // Supabase client and its @supabase/* sub-packages
          if (id.includes('@supabase')) return 'supabase';

          // React runtime
          if (id.includes('react') || id.includes('scheduler')) return 'react';

          // Animation runtime (framer-motion). Must NOT share a chunk with the
          // react-markdown dependency tree: react-markdown lives in the react
          // chunk and imports unified/remark (which land in vendor), while
          // framer-motion (vendor) calls React.createContext() at module scope.
          // Together that creates a circular vendor <-> react chunk dependency
          // that evaluates React before it initializes, crashing the app at
          // boot with "Cannot read properties of undefined (reading
          // 'createContext')" — a black screen. Isolating framer-motion into
          // its own chunk keeps the graph acyclic.
          if (id.includes('framer-motion')) return 'motion';

          // PDF generation / viewing
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (
            id.includes('jspdf') ||
            id.includes('html2canvas') ||
            id.includes('canvg') ||
            id.includes('svg-to-pdfkit') ||
            id.includes('dompurify')
          ) return 'jspdf';

          // Spreadsheet (Excel) import/export
          if (id.includes('exceljs')) return 'exceljs';

          // ZIP archives + file downloads
          if (id.includes('jszip') || id.includes('file-saver')) return 'export';

          // Icon set (kept out of optimizeDeps)
          if (id.includes('lucide-react')) return 'icons';

          // Everything else from node_modules
          return 'vendor';
        },
      },
    },
  },
});
