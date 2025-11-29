import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Gradual migration from Jest - add directories here as they're migrated
    include: [
      'test/assertions/**/*.test.ts',
      'test/codeScans/**/*.test.ts',
      'test/matchers/**/*.test.ts',
      'test/database/**/*.test.ts',
      'test/site/**/*.test.ts',
      'test/testCase/**/*.test.ts',
      'test/validators/**/*.test.ts',
      'test/utils/**/*.test.ts',
      'test/models/**/*.test.ts',
      'test/app/**/*.test.ts',
      'test/globalConfig/**/*.test.ts',
      'test/integrations/**/*.test.ts',
      'test/external/**/*.test.ts',
      'test/progress/**/*.test.ts',
      'test/types/**/*.test.ts',
      'test/providers/xai/**/*.test.ts',
      'test/prompts/**/*.test.ts',
      'test/python/**/*.test.ts',
      'test/logger.test.ts',
      'test/cache.test.ts',
      'test/config-schema.test.ts',
      'test/tracing/**/*.test.ts',
      'test/util/**/*.test.ts',
    ],
    // Exclude integration tests
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
    // Use node environment (not jsdom) for backend tests
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
