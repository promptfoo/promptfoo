import { defineConfig } from 'tsup';

export default defineConfig([
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
    },
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: [
      // Externalize only heavy native deps that must remain external
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
    },
    external: ['better-sqlite3', 'playwright', 'sharp', '@swc/core', 'esbuild', 'fsevents'],
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
    },
    logOverride: {
      'empty-import-meta': 'silent', // Silence import.meta warnings in CJS builds
    },
    outExtension() {
      return { '.js': '.cjs' };
    },
    external: ['better-sqlite3', 'playwright', 'sharp', '@swc/core', 'esbuild', 'fsevents'],
  },
]);
