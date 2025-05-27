/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      exclude: ['fs', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: false,
      },
      protocolImports: true,
    }),
    // Custom plugin to handle polyfill imports in tests
    {
      name: 'polyfill-resolver',
      resolveId(id: string) {
        if (id.includes('vite-plugin-node-polyfills/shims/')) {
          return id;
        }
        return null;
      },
      load(id: string) {
        if (id.includes('vite-plugin-node-polyfills/shims/buffer')) {
          return 'export default globalThis.Buffer || {};';
        }
        if (id.includes('vite-plugin-node-polyfills/shims/process')) {
          return 'export default globalThis.process || { env: {} };';
        }
        if (id.includes('vite-plugin-node-polyfills/shims/global')) {
          return 'export default globalThis;';
        }
        if (id.includes('vite-plugin-node-polyfills/shims/util')) {
          return 'export default {};';
        }
        return null;
      },
    },
  ] as any,
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@promptfoo': path.resolve(__dirname, '../'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    pool: 'forks',
    server: {
      deps: {
        inline: ['react', 'react-dom', '@testing-library/react'],
      },
    },
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@testing-library/react'],
  },
  build: {
    rollupOptions: {
      external: [
        'vite-plugin-node-polyfills/shims/buffer',
        'vite-plugin-node-polyfills/shims/process',
        'vite-plugin-node-polyfills/shims/global',
        'vite-plugin-node-polyfills/shims/util',
      ],
    },
  },
});
