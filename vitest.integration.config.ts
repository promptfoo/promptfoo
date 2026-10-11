import { defineConfig } from 'vitest/config';
import { commonTestConfig } from './scripts/commonTestConfig.mjs';

export default defineConfig({
  test: {
    ...commonTestConfig(),
    exclude: ['**/node_modules/**'],
    globals: true,
    include: ['**/*.integration.test.ts'],
    execArgv: [
      '--max-old-space-size=4096', // 4GB per worker for integration tests
    ],

    // Integration tests may take longer
    testTimeout: 60_000, // 60s per test
    hookTimeout: 60_000,
    teardownTimeout: 15_000,
  },
});
