import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // Per-chapter progressive loading (§18.3) will hang off dynamic imports;
    // keep vendor chunks legible from day one so the ≤25 MB budget is auditable.
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ['@babylonjs/core'],
        },
      },
    },
  },
});
