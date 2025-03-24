/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import path from 'path';
import type { PluginOption } from 'vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import packageJson from '../../package.json';

const API_PORT = process.env.API_PORT || '15500';

if (process.env.NODE_ENV === 'development') {
  process.env.VITE_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL =
    process.env.PROMPTFOO_REMOTE_API_BASE_URL || `http://localhost:${API_PORT}`;
  process.env.VITE_PUBLIC_PROMPTFOO_SHARE_API_URL = `http://localhost:${API_PORT}`;
} else {
  process.env.VITE_PUBLIC_PROMPTFOO_APP_SHARE_URL = 'https://app.promptfoo.dev';
  process.env.VITE_PUBLIC_PROMPTFOO_SHARE_API_URL = 'https://api.promptfoo.dev';
  process.env.VITE_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL =
    process.env.PROMPTFOO_REMOTE_API_BASE_URL || '';
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
  },
  base: process.env.VITE_PUBLIC_BASENAME || '/',
  plugins: [
    react(), 
    nodePolyfills({
      // Configure polyfills as needed
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Use internal versions for better compatibility
      include: ['buffer', 'process', 'util', 'events', 'path', 'stream', 'os'],
      // exclude: [],
      protocolImports: true,
    })
  ] as PluginOption[],
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
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    emptyOutDir: true,
    outDir: '../../dist/src/app',
    // Target modern browsers for better performance
    target: 'esnext',
    // Vite 6 now uses native ESM for all output by default
    // No need to specify module format
    rollupOptions: {
      external: [
        'vite-plugin-node-polyfills/shims/buffer',
        'vite-plugin-node-polyfills/shims/global',
        'vite-plugin-node-polyfills/shims/process'
      ],
      output: {
        // Ensure proper resolution of polyfills
        manualChunks(id) {
          if (id.includes('node_modules/vite-plugin-node-polyfills')) {
            return 'polyfills';
          }
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
  },
  define: {
    'import.meta.env.VITE_PROMPTFOO_VERSION': JSON.stringify(packageJson.version),
    'import.meta.env.VITE_PROMPTFOO_DISABLE_TELEMETRY': JSON.stringify(
      process.env.PROMPTFOO_DISABLE_TELEMETRY || 'false',
    ),
    // Make sure Buffer, process, and global are available
    'global': 'globalThis',
  },
});
