/// <reference types="vitest" />

import { fileURLToPath } from 'node:url';
import os from 'os';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';
import packageJson from '../../package.json' with { type: 'json' };

/**
 * Plugin to replace Node.js modules with browser-compatible versions.
 * This allows us to avoid bundling heavy Node polyfills by providing
 * lightweight browser implementations.
 */
function browserModulesPlugin(): Plugin {
  // Map of Node module paths to their browser replacements
  const replacements: Array<{ nodePath: string; browserPath: string; patterns: string[] }> = [
    {
      // logger.ts uses fs, path, winston - replace with console-based logger
      nodePath: path.resolve(__dirname, '../logger.ts'),
      browserPath: path.resolve(__dirname, '../logger.browser.ts'),
      patterns: ['./logger', '../logger', '/logger'],
    },
    {
      // createHash.ts uses Node crypto - replace with pure JS SHA-256
      nodePath: path.resolve(__dirname, '../util/createHash.ts'),
      browserPath: path.resolve(__dirname, '../util/createHash.browser.ts'),
      patterns: ['./createHash', '../createHash', '/createHash'],
    },
  ];

  return {
    name: 'browser-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) {
        return null;
      }

      for (const { nodePath, browserPath, patterns } of replacements) {
        // Check if source matches any of the patterns
        const matches = patterns.some((p) => source === p || source.endsWith(p));
        if (!matches) {
          continue;
        }

        // Resolve the import path
        const resolvedPath = path.resolve(path.dirname(importer), source);

        // Check if it matches the node module path (with or without .ts extension)
        if (
          resolvedPath === nodePath ||
          resolvedPath === nodePath.replace('.ts', '') ||
          resolvedPath + '.ts' === nodePath
        ) {
          return browserPath;
        }
      }
      return null;
    },
  };
}

// Calculate max forks for test parallelization
const cpuCount = os.cpus().length;
// Use more cores in CI where performance is critical
const maxForks = process.env.CI
  ? Math.min(cpuCount, 4) // Use up to 4 cores in CI
  : Math.max(cpuCount - 2, 2); // Leave headroom for system locally

const API_PORT = process.env.API_PORT || '15500';

// These environment variables are inherited from the parent process (main promptfoo server)
// We set VITE_ prefixed variables here so Vite can expose them to the client code
if (process.env.NODE_ENV === 'development') {
  process.env.VITE_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL =
    process.env.PROMPTFOO_REMOTE_API_BASE_URL || `http://localhost:${API_PORT}`;
} else {
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
    browserModulesPlugin(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
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
      output: {
        // Manual chunking to split vendor libraries
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts', 'chart.js'],
          'vendor-utils': ['js-yaml', 'diff'],
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
    // Enable CSS processing for component styles
    css: true,

    // Memory leak prevention settings
    // Use forks (child processes) instead of threads for better memory isolation
    pool: 'forks',
    // Vitest 4: poolOptions are now top-level
    maxWorkers: maxForks,
    isolate: true, // Each test file gets a clean environment
    execArgv: [
      '--max-old-space-size=2048', // 2GB per worker for frontend tests
    ],

    // Timeouts to prevent stuck tests from hanging forever
    // Stricter timeouts in CI to fail fast and report timeouts as failures
    testTimeout: process.env.CI ? 20_000 : 30_000, // 20s in CI, 30s locally
    hookTimeout: process.env.CI ? 20_000 : 30_000, // 20s in CI, 30s locally
    teardownTimeout: 10_000, // 10s for cleanup

    // Limit concurrent tests within each worker to prevent memory spikes
    maxConcurrency: 5,

    // Fail fast on first error in CI
    bail: process.env.CI ? 1 : 0,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/setupTests.ts',
        'src/**/*.stories.tsx',
      ],
      // Collect coverage for all files to identify untested files
      // @ts-expect-error - 'all' is valid in Vitest v8 coverage but types are incomplete
      all: true,
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
    'import.meta.env.VITE_PUBLIC_BASENAME': JSON.stringify(process.env.VITE_PUBLIC_BASENAME || ''),
  },
});
