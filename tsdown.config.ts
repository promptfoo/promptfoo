import { readFileSync } from 'fs';
import { defineConfig } from 'tsdown';

// Read package.json for version constants
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

// Build-time constants injected into all builds
// These replace the __PROMPTFOO_*__ placeholders in src/version.ts
const versionDefines = {
  __PROMPTFOO_VERSION__: JSON.stringify(packageJson.version),
  __PROMPTFOO_POSTHOG_KEY__: JSON.stringify(process.env.PROMPTFOO_POSTHOG_KEY || ''),
  __PROMPTFOO_ENGINES_NODE__: JSON.stringify(packageJson.engines.node),
};

// All configs use clean: false. Use `npm run build:clean` for explicit cleaning.
// This prevents race conditions when multiple configs share the same outDir.
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
    clean: false,
    fixedExtension: false, // Use .js extension for ESM since package.json has type: module
    define: {
      ...versionDefines,
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
    clean: false,
    shims: true, // Provides __dirname, __filename shims automatically
    sourcemap: true,
    fixedExtension: false, // Use .js extension for ESM since package.json has type: module
    define: {
      ...versionDefines,
      BUILD_FORMAT: '"esm"',
      'process.env.BUILD_FORMAT': '"esm"',
    },
    outputOptions: {
      banner: '#!/usr/bin/env node',
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
    clean: false,
    fixedExtension: false, // Use .js extension for ESM since package.json has type: module
    define: {
      ...versionDefines,
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
    clean: false,
    fixedExtension: true, // Use .cjs extension for CJS output
    define: {
      ...versionDefines,
      BUILD_FORMAT: '"cjs"',
      'process.env.BUILD_FORMAT': '"cjs"',
    },
    external: [
      // Externalize all bare module imports so Node resolves CJS deps natively
      /^[a-z@][^:]*/,
    ],
  },
]);
