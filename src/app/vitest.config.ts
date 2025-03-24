/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Special plugin to handle direct imports from vite-plugin-node-polyfills/shims
const shimsResolverPlugin = {
  name: 'shims-resolver',
  resolveId(id) {
    if (id === 'vite-plugin-node-polyfills/shims/buffer') {
      return path.resolve(__dirname, 'src/shims/buffer.js');
    }
    if (id === 'vite-plugin-node-polyfills/shims/process') {
      return path.resolve(__dirname, 'src/shims/process.js');
    }
    if (id === 'vite-plugin-node-polyfills/shims/global') {
      return path.resolve(__dirname, 'src/shims/global.js');
    }
    return null;
  }
};

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
      // Include the same polyfills as in vite.config.ts
      include: ['buffer', 'process', 'util', 'events', 'stream', 'path', 'querystring', 
                'url', 'string_decoder', 'punycode', 'http', 'https', 'os', 
                'assert', 'constants', 'timers', 'console', 'vm', 'zlib', 
                'tty', 'domain', 'dns', 'dgram', 'child_process', 'cluster', 
                'module', 'net', 'readline', 'repl', 'tls', 'fs', 'crypto'],
      protocolImports: true,
    }),
    shimsResolverPlugin
  ],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@promptfoo': path.resolve(__dirname, '../'),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts', './src/setupNodePolyfills.ts'],
    globals: true,
  },
  define: {
    'global': 'globalThis',
  },
});
