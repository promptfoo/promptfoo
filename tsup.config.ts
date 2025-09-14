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
    banner: {
      js: '#!/usr/bin/env node'
    },
    external: ['better-sqlite3', 'playwright', 'sharp'] // Externalize heavy deps
  },
  // Library ESM build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node20',
    outDir: 'dist/src',
    splitting: false,
    treeshake: true,
    external: ['better-sqlite3', 'playwright', 'sharp']
  },
  // Library CJS build for compatibility
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    target: 'node20',
    outDir: 'dist/src',
    outExtension: { '.js': '.cjs' },
    external: ['better-sqlite3', 'playwright', 'sharp']
  }
]);