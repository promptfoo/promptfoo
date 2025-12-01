import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests only - files matching *.integration.test.ts
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
    // Use node environment for backend tests
    environment: 'node',
    // Enable globals so we don't need to import describe/it/expect everywhere
    globals: true,
    // Setup files
    setupFiles: ['./vitest.setup.ts'],
    // Root directory
    root: '.',
    // Transform settings for ESM packages
    deps: {
      interopDefault: true,
    },
  },
});
