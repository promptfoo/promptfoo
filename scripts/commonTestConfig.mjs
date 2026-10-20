import os from 'os';

export function commonTestConfig() {
  return {
    deps: {
      interopDefault: true,
    },
    environment: 'node',
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
    // Vitest 4 exposes fork worker options at the top level.
    // Use most cores but leave 2 for system/main process
    maxWorkers: Math.max(os.cpus().length - 2, 4),
    isolate: true, // Each test file gets a clean environment
    // Limit concurrent tests within each worker to prevent memory spikes
    maxConcurrency: 10,
  };
}
