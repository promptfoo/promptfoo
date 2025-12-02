import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    deps: {
      interopDefault: true,
    },
    environment: 'node',
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
    globals: true,
    include: ['test/**/*.test.ts'],
    root: '.',
    setupFiles: ['./vitest.setup.ts'],
  },
});
