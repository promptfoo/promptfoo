/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { defineConfig } from 'vitest/config';

// Special plugin to handle direct imports from vite-plugin-node-polyfills/shims
// Some external modules like csv-parse directly import from these paths
const shimsResolverPlugin = {
  name: 'shims-resolver',
  resolveId(id: string) {
    if (id === 'vite-plugin-node-polyfills/shims/buffer') {
      return '\0virtual:buffer-shim';
    }
    if (id === 'vite-plugin-node-polyfills/shims/process') {
      return '\0virtual:process-shim';
    }
    if (id === 'vite-plugin-node-polyfills/shims/global') {
      return '\0virtual:global-shim';
    }
    return null;
  },
  load(id: string) {
    if (id === '\0virtual:buffer-shim') {
      return `
        const BufferImpl = globalThis.Buffer || { 
          from: data => ({ toString: () => String(data) }),
          isBuffer: () => false
        };
        export default BufferImpl;
      `;
    }
    if (id === '\0virtual:process-shim') {
      return `
        const processImpl = globalThis.process || { 
          env: {}, 
          nextTick: fn => setTimeout(fn, 0),
          browser: true
        };
        export default processImpl;
      `;
    }
    if (id === '\0virtual:global-shim') {
      return `export default globalThis;`;
    }
    return null;
  },
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
      include: [
        'buffer',
        'process',
        'util',
        'events',
        'stream',
        'path',
        'querystring',
        'url',
        'string_decoder',
        'punycode',
        'http',
        'https',
        'os',
        'assert',
        'constants',
        'timers',
        'console',
        'vm',
        'zlib',
        'tty',
        'domain',
        'dns',
        'dgram',
        'child_process',
        'cluster',
        'module',
        'net',
        'readline',
        'repl',
        'tls',
        'fs',
        'crypto',
      ],
      protocolImports: true,
    }),
    shimsResolverPlugin,
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
    global: 'globalThis',
  },
});
