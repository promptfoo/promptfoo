/// <reference types="vitest" />

import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import packageJson from '../../package.json';

const API_PORT = process.env.API_PORT || '15500';

// These environment variables are inherited from the parent process (main promptfoo server)
// We set VITE_ prefixed variables here so Vite can expose them to the client code
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
    nodePolyfills(), // Removed vm exclusion - we need it for new Function() calls
  ],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@promptfoo': path.resolve(__dirname, '../'),
    },
  },
  optimizeDeps: {
    exclude: ['react-syntax-highlighter'],
  },
  build: {
    emptyOutDir: true,
    outDir: '../../dist/src/app',
    // Enable source maps for production debugging
    sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,
    // Minification settings
    minify: 'terser',
    terserOptions: {
      compress: {
        // Keep console statements - useful for a local development tool
        drop_console: false,
        drop_debugger: process.env.NODE_ENV === 'production',
      },
    },
    rollupOptions: {
      output: {
        // Manual chunking to split vendor libraries
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mui-core': ['@mui/material', '@mui/system'],
          'vendor-mui-icons': ['@mui/icons-material'],
          'vendor-mui-x': ['@mui/x-data-grid', '@mui/x-charts'],
          'vendor-charts': ['recharts', 'chart.js'],
          'vendor-utils': ['js-yaml', 'diff', 'csv-parse', 'csv-stringify'],
          'vendor-syntax': ['prismjs'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
        },
      },
    },
    // Increase chunk size warning limit slightly since we're splitting properly
    chunkSizeWarningLimit: 600,
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
    'import.meta.env.VITE_POSTHOG_KEY': JSON.stringify(process.env.PROMPTFOO_POSTHOG_KEY || ''),
    'import.meta.env.VITE_POSTHOG_HOST': JSON.stringify(
      process.env.PROMPTFOO_POSTHOG_HOST || 'https://a.promptfoo.app',
    ),
  },
});
