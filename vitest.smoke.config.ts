import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    deps: {
      interopDefault: true,
    },
    environment: 'node',
    exclude: ['**/node_modules/**'],
    globals: false,
    include: ['test/smoke/**/*.test.ts'],
    root: '.',
    setupFiles: ['./vitest.setup.ts'],

    // Run smoke tests in sequence for predictable output
    sequence: {
      shuffle: false,
    },

    // Use forks for better memory isolation
    pool: 'forks',
    maxWorkers: 2, // Smoke tests should be fast, don't need many workers

    // Smoke tests should be fast
    testTimeout: 30_000, // 30s per test
    hookTimeout: 30_000,
    teardownTimeout: 10_000,

    maxConcurrency: 5,
  },
});
