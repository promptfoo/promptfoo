/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Use internal versions for better compatibility
      include: ['buffer', 'process', 'util', 'events', 'path', 'stream', 'os'],
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@promptfoo': path.resolve(__dirname, '../'),
      // Provide explicit paths for node polyfills in case they're imported directly
      'node:buffer': 'vite-plugin-node-polyfills/polyfills/buffer',
      'node:process': 'vite-plugin-node-polyfills/polyfills/process',
      'node:util': 'vite-plugin-node-polyfills/polyfills/util',
      'node:stream': 'vite-plugin-node-polyfills/polyfills/stream',
      'node:events': 'vite-plugin-node-polyfills/polyfills/events',
      'node:path': 'vite-plugin-node-polyfills/polyfills/path',
      'node:os': 'vite-plugin-node-polyfills/polyfills/os',
    },
  },
  optimizeDeps: {
    include: [
      'vite-plugin-node-polyfills/polyfills/buffer',
      'vite-plugin-node-polyfills/polyfills/process',
      'vite-plugin-node-polyfills/polyfills/util',
      'vite-plugin-node-polyfills/polyfills/stream',
      'vite-plugin-node-polyfills/polyfills/events',
      'vite-plugin-node-polyfills/polyfills/path',
      'vite-plugin-node-polyfills/polyfills/os',
    ],
  },
  build: {
    rollupOptions: {
      external: [
        'vite-plugin-node-polyfills/shims/buffer',
        'vite-plugin-node-polyfills/shims/global',
        'vite-plugin-node-polyfills/shims/process'
      ]
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts', './src/setupNodePolyfills.ts'],
    globals: true,
  },
  define: {
    // Make sure Buffer, process, and global are available
    'global': 'globalThis',
  },
});
