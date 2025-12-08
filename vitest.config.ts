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
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
    globals: false,
    include: ['test/**/*.test.ts'],
    root: '.',
    setupFiles: ['./vitest.setup.ts'],

    // Use forks (child processes) instead of threads for better memory isolation.
    // When a fork dies or is recycled, the OS fully reclaims its memory.
    // Worker threads share memory with the main process and can leak.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks,
        minForks: 2,
        isolate: true, // Each test file gets a clean environment
        execArgv: [
          '--max-old-space-size=3072', // 3GB per worker - generous but bounded
        ],
      },
    },

    // Timeouts to prevent stuck tests from hanging forever
    testTimeout: 30_000, // 30s per test
    hookTimeout: 30_000, // 30s for beforeAll/afterAll hooks
    teardownTimeout: 10_000, // 10s for cleanup

    // Limit concurrent tests within each worker to prevent memory spikes
    maxConcurrency: 10,

    // Fail fast on first error in CI, continue locally for full picture
    bail: process.env.CI ? 1 : 0,
  },
});
