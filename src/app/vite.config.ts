/// <reference types="vitest" />

import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import packageJson from '../../package.json' with { type: 'json' };

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
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress eval warnings from vm-browserify polyfill
        if (warning.code === 'EVAL' && warning.id?.includes('vm-browserify')) {
          return;
        }
        warn(warning);
      },
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
    // Increase chunk size warning limit for this development tool
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: false,
    // Enable CSS processing for MUI X v8
    css: true,
    // Force vitest to transform MUI packages including CSS imports
    server: {
      deps: {
        inline: ['@mui/x-data-grid', '@mui/x-charts', 'node-stdlib-browser'],
      },
    },
    // Fix ESM directory import issue with punycode in node-stdlib-browser
    alias: {
      'punycode/': 'punycode',
    },
    // Suppress known MUI and React Testing Library warnings that don't indicate real problems
    onConsoleLog(log: string, type: 'stdout' | 'stderr'): false | undefined {
      if (type === 'stderr') {
        const suppressPatterns = [
          // Suppress act() warnings (we've fixed all fixable tests, these are library-level issues)
          /An update to ForwardRef\(Tabs\) inside a test was not wrapped in act/,
          /An update to ForwardRef\(TouchRipple\) inside a test was not wrapped in act/,
          /An update to ForwardRef\(ButtonBase\) inside a test was not wrapped in act/,
          /An update to ForwardRef\(FormControl\) inside a test was not wrapped in act/,
          /An update to ForwardRef\(Tooltip\) inside a test was not wrapped in act/,
          /An update to TransitionGroup inside a test was not wrapped in act/,
          /An update to \w+ inside a test was not wrapped in act/,
          /The current testing environment is not configured to support act/,

          // Keep these suppressed (not fixable - library/DOM issues)
          /validateDOMNesting/,
          /MUI: You have provided an out-of-range value/,
          /MUI: The `value` provided to the Tabs component is invalid/,
          /Failed prop type: MUI/,
          /ReactDOM\.render is no longer supported/,
          /unmountComponentAtNode is deprecated/,
          /A component is changing an? (?:uncontrolled|controlled) input to be (?:controlled|uncontrolled)/,
          /Function components cannot be given refs/,
          /React does not recognize the `.*` prop on a DOM element/,
          /No worst strategy found for plugin/,

          // Test data issues
          /Received NaN for the.*children/, // Test data setup issue in ResultsTable.test.tsx
          /Encountered two children with the same key/, // Fixed in component, but may appear in old tests
        ];

        if (suppressPatterns.some((pattern) => pattern.test(log))) {
          return false; // Suppress this log
        }
      }
    },
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
