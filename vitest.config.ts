import { defineConfig } from 'vitest/config';
import { commonTestConfig } from './scripts/commonTestConfig.mjs';

export default defineConfig({
  test: {
    ...commonTestConfig(),
    exclude: ['**/*.integration.test.ts', '**/node_modules/**', 'test/smoke/**'],
    globals: false,
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],

    // Keep successful backend unit-test runs focused on failures. Set
    // PROMPTFOO_TEST_SHOW_OUTPUT=true when debugging stdout/stderr from tests.
    silent: process.env.PROMPTFOO_TEST_SHOW_OUTPUT !== 'true',
    execArgv: [
      '--max-old-space-size=3072', // 3GB per worker - generous but bounded
    ],

    // Timeouts to prevent stuck tests from hanging forever
    testTimeout: 30_000, // 30s per test
    hookTimeout: 30_000, // 30s for beforeAll/afterAll hooks
    teardownTimeout: 10_000, // 10s for cleanup

    // Fail fast on first error in CI, continue locally for full picture
    bail: process.env.CI ? 1 : 0,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/__mocks__/**',
        'src/app/**', // Frontend workspace has its own coverage
        'src/entrypoint.ts',
        'src/main.ts',
        'src/migrate.ts',
      ],
      // @ts-expect-error - 'all' is valid in Vitest v8 coverage but types are incomplete
      all: true,
    },
  },
});
