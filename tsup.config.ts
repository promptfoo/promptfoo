import { defineConfig } from 'tsup';

export default defineConfig([
  // Server (ESM only) - stable path for workflows
  {
    entry: { 'server/index': 'src/server/index.ts' },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist/src',
    splitting: false,
    shims: true,
    sourcemap: true,
    define: {
      BUILD_FORMAT: '"esm"',
      'process.env.BUILD_FORMAT': '"esm"',
    },
    external: [
      // Externalize all bare module imports so Node resolves CJS deps natively
      /^[a-z@][^:]*/,
    ],
  },
  // CLI binary (ESM only)
  {
    entry: ['src/main.ts'],
    format: ['esm'],
    target: 'node20',
    outDir: 'dist/src',
    clean: true,
    shims: true, // Provides __dirname, __filename shims automatically
    sourcemap: true,
    define: {
      BUILD_FORMAT: '"esm"',
      'process.env.BUILD_FORMAT': '"esm"',
    },
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: [
      // Externalize all bare module imports so Node resolves CJS deps natively
      /^[a-z@][^:]*/,
      // Ensure critical native deps remain external
      'better-sqlite3',
      'playwright',
      'sharp',
      '@swc/core',
      'esbuild',
      'fsevents',
    ],
  },
  // Library ESM build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node20',
    outDir: 'dist/src',
    splitting: false,
    treeshake: true,
    sourcemap: true,
    shims: true, // Ensure library ESM build has shims
    define: {
      BUILD_FORMAT: '"esm"',
      'process.env.BUILD_FORMAT': '"esm"',
    },
    external: [
      // Externalize all bare module imports so Node resolves CJS deps natively
      /^[a-z@][^:]*/,
    ],
  },
  // Library CJS build for compatibility
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    target: 'node20',
    outDir: 'dist/src',
    sourcemap: true,
    define: {
      BUILD_FORMAT: '"cjs"',
      'process.env.BUILD_FORMAT': '"cjs"',
    },
    logOverride: {
      'empty-import-meta': 'silent', // Silence import.meta warnings in CJS builds
    },
    esbuildOptions: (options) => {
      options.logOverride = { 'empty-import-meta': 'silent' };
    },
    outExtension() {
      return { '.js': '.cjs' };
    },
    external: [
      // Externalize all bare module imports so Node resolves CJS deps natively
      /^[a-z@][^:]*/,
    ],
  },
]);
