import { fileURLToPath } from 'node:url';
import path from 'path';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    // CSS processing for MUI components
    css: true,
    // Memory and timeout settings
    testTimeout: 30_000,
    hookTimeout: 30_000,
    teardownTimeout: 10_000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx', 'src/setupTests.ts'],
      // @ts-expect-error - 'all' is valid in Vitest v8 coverage but types are incomplete
      all: true,
    },
  },
  resolve: {
    alias: {
      '@site': path.resolve(__dirname),
    },
  },
});
