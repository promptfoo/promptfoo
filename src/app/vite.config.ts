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
      // Include all Node.js polyfills
      include: ['buffer', 'process', 'util', 'events', 'stream', 'path', 'querystring', 
                'url', 'string_decoder', 'punycode', 'http', 'https', 'os', 
                'assert', 'constants', 'timers', 'console', 'vm', 'zlib', 
                'tty', 'domain', 'dns', 'dgram', 'child_process', 'cluster', 
                'module', 'net', 'readline', 'repl', 'tls', 'fs', 'crypto'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Enables auto resolution of Node.js built-ins
      protocolImports: true,
    })
  ] as PluginOption[],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@promptfoo': path.resolve(__dirname, '../'),
    },
  },
  optimizeDeps: {
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
    rollupOptions: {
      output: {
        // Group polyfills into a separate chunk
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
    // Make sure global is defined
    'global': 'globalThis',
  },
});
