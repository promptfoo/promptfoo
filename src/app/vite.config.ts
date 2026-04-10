/// <reference types="vitest/config" />

import { fileURLToPath } from 'node:url';
import os from 'os';
import path from 'path';

import react from '@vitejs/plugin-react';
import packageJson from '../../package.json' with { type: 'json' };
import {
  browserModulesPlugin,
  reactCompilerPlugin,
  vendorCodeSplittingGroups,
} from './vite.shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
// Export a plain object here to avoid CI-only type conflicts from multiple Vite installs in the monorepo.
export default {
  server: {
    port: 3000,
  },
  base: process.env.VITE_PUBLIC_BASENAME || '/',
  plugins: [browserModulesPlugin(), reactCompilerPlugin(), ...react()],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@promptfoo': path.resolve(__dirname, '../'),
    },
  },
  optimizeDeps: {
    // Pre-bundle react/compiler-runtime so Vite doesn't discover it late
    // (injected by the React Compiler babel plugin) and trigger a full
    // dep re-optimization that invalidates in-flight requests.
    include: ['react/compiler-runtime'],
    exclude: ['react-syntax-highlighter'],
  },
  build: {
    emptyOutDir: true,
    outDir: '../../dist/src/app',
    // Enable source maps for production debugging
    sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [...vendorCodeSplittingGroups],
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

    // Run tests in random order to catch test isolation issues early.
    sequence: {
      shuffle: true,
    },

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
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        'src/setupTests.ts',
        'src/**/*.stories.tsx',
      ],
      all: true,
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
};
