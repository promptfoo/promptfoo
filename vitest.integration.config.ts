import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    deps: {
      interopDefault: true,
    },
    environment: 'node',
    exclude: ['**/node_modules/**'],
    globals: true,
    include: ['**/*.integration.test.ts'],
    poolOptions: {
      threads: {
        maxThreads: 2,
      },
    },
    root: '.',
    setupFiles: ['./vitest.setup.ts'],
  },
});
