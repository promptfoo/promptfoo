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
      // To exclude specific polyfills, add them to this list.
      exclude: [
        'fs', // Excludes the polyfill for `fs` and `node:fs`.
        'process', // Exclude process polyfill for React 19 compatibility
      ],
      // Whether to polyfill specific globals.
      globals: {
        Buffer: true, // can also be 'build', 'dev', or false
        global: true,
        process: false, // Let React 19 handle process
      },
      // Whether to polyfill Node.js built-in modules.
      protocolImports: true,
    }),
  ] as PluginOption[],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@promptfoo': path.resolve(__dirname, '../'),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: '../../dist/src/app',
    rollupOptions: {
      external: [
        'vite-plugin-node-polyfills/shims/buffer',
        'vite-plugin-node-polyfills/shims/process',
        'vite-plugin-node-polyfills/shims/global',
        'vite-plugin-node-polyfills/shims/util',
      ],
      onwarn(warning, warn) {
        // Suppress warnings about vite-plugin-node-polyfills shims
        if (
          warning.code === 'UNRESOLVED_IMPORT' &&
          warning.id?.includes('vite-plugin-node-polyfills/shims/')
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
  define: {
    'import.meta.env.VITE_PROMPTFOO_VERSION': JSON.stringify(packageJson.version),
    'import.meta.env.VITE_PROMPTFOO_DISABLE_TELEMETRY': JSON.stringify(
      process.env.PROMPTFOO_DISABLE_TELEMETRY || 'false',
    ),
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@testing-library/react'],
  },
});
