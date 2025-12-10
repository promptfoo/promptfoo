import { defineConfig } from 'vitest/config';
import os from 'os';

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
