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
  },
  resolve: {
    alias: {
      '@site': path.resolve(__dirname),
    },
  },
});
