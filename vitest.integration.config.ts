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
    exclude: ['**/node_modules/**'],
    globals: true,
    include: ['**/*.integration.test.ts'],
    root: '.',
    setupFiles: ['./vitest.setup.ts'],

    // Run tests in random order to catch test isolation issues early.
    // Tests should not depend on execution order or shared state.
    // Override with --sequence.shuffle=false when debugging specific failures.
    sequence: {
      shuffle: true,
    },

    // Use forks for better memory isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks,
        minForks: 2,
        isolate: true,
        execArgv: [
          '--max-old-space-size=4096', // 4GB per worker for integration tests
        ],
      },
    },

    // Integration tests may take longer
    testTimeout: 60_000, // 60s per test
    hookTimeout: 60_000,
    teardownTimeout: 15_000,

    maxConcurrency: 10,
  },
});
