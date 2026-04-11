import { fileURLToPath } from 'node:url';
import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docusaurusComponentStub = path.resolve(__dirname, 'src/test/docusaurusComponentStub.tsx');
const docusaurusRuntimeStub = path.resolve(__dirname, 'src/test/docusaurusRuntimeStub.tsx');
const docusaurusUseIsBrowserStub = path.resolve(__dirname, 'src/test/useIsBrowserStub.ts');

export default defineConfig({
  plugins: [...react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'forks',
    isolate: true,
    sequence: {
      shuffle: true,
    },
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
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/setupTests.ts',
        'src/test/**',
      ],
      // @ts-expect-error - 'all' is valid in Vitest v8 coverage but types are incomplete
      all: true,
    },
  },
  resolve: {
    alias: [
      { find: '@site', replacement: path.resolve(__dirname) },
      // Docusaurus provides these modules at build time. Vitest needs local
      // stand-ins so V8 coverage can transform uncovered site files.
      { find: /^@docusaurus\/(?:Head|Link)$/, replacement: docusaurusComponentStub },
      {
        find: /^@docusaurus\/(?:plugin-content-blog|plugin-content-docs)(?:\/client)?$/,
        replacement: docusaurusRuntimeStub,
      },
      { find: /^@docusaurus\/useIsBrowser$/, replacement: docusaurusUseIsBrowserStub },
      {
        find: /^@docusaurus\/(?:router|theme-common|useBaseUrl|useDocusaurusContext)$/,
        replacement: docusaurusRuntimeStub,
      },
      { find: /^@theme(?:-original)?\/.+$/, replacement: docusaurusComponentStub },
    ],
  },
});
