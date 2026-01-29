import os from 'os';

import { defineConfig } from 'vitest/config';

const cpuCount = os.cpus().length;
// Use most cores but leave 2 for system/main process
const maxForks = Math.max(cpuCount - 2, 4);

export default defineConfig({
  test: {
    deps: {
      interopDefault: true,
    },
    environment: 'node',
    exclude: ['**/*.integration.test.ts', '**/node_modules/**', 'test/smoke/**'],
    globals: false,
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    root: '.',
    setupFiles: ['./vitest.setup.ts'],

    // Run tests in random order to catch test isolation issues early.
    // Tests should not depend on execution order or shared state.
    // Override with --sequence.shuffle=false when debugging specific failures.
    sequence: {
      shuffle: true,
    },

    // Use forks (child processes) instead of threads for better memory isolation.
    // When a fork dies or is recycled, the OS fully reclaims its memory.
    // Worker threads share memory with the main process and can leak.
    pool: 'forks',
    // Vitest 4: poolOptions are now top-level
    maxWorkers: maxForks,
    isolate: true, // Each test file gets a clean environment
    execArgv: [
      '--max-old-space-size=3072', // 3GB per worker - generous but bounded
    ],

    // Timeouts to prevent stuck tests from hanging forever
    testTimeout: 30_000, // 30s per test
    hookTimeout: 30_000, // 30s for beforeAll/afterAll hooks
    teardownTimeout: 10_000, // 10s for cleanup

    // Limit concurrent tests within each worker to prevent memory spikes
    maxConcurrency: 10,

    // Fail fast on first error in CI, continue locally for full picture
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
        'src/__mocks__/**',
        'src/app/**', // Frontend workspace has its own coverage
        'src/entrypoint.ts',
        'src/main.ts',
        'src/migrate.ts',
      ],
      // @ts-expect-error - 'all' is valid in Vitest v8 coverage but types are incomplete
      all: true,
    },
  },
});
