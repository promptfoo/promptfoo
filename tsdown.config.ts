import { readFileSync } from 'fs';

import { defineConfig } from 'tsdown';

// Read package.json for version constants
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

// Extract minimum Node.js version from engines field (e.g., ">=20.0.0" → 20)
// This is injected into entrypoint.ts for the version check
// Note: Assumes engines.node is a simple semver constraint like ">=20.0.0"
const enginesNode: string = packageJson.engines?.node ?? '';
let minNodeVersion = parseInt(enginesNode.replace(/[^\d.]/g, ''), 10);
if (Number.isNaN(minNodeVersion)) {
  console.warn(
    `[tsdown] Warning: Could not parse engines.node "${enginesNode}". Defaulting to Node.js 20.`,
  );
  minNodeVersion = 20;
}

// Build-time constants injected into all builds
// These replace the __PROMPTFOO_*__ placeholders in source files
// Note: tsdown define requires all values to be strings
const versionDefines = {
  __PROMPTFOO_VERSION__: JSON.stringify(packageJson.version),
  __PROMPTFOO_POSTHOG_KEY__: JSON.stringify(process.env.PROMPTFOO_POSTHOG_KEY || ''),
  __PROMPTFOO_MIN_NODE_VERSION__: String(minNodeVersion),
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
    inlineOnly: false, // Disable warning about bundling dependencies
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
    entry: ['src/entrypoint.ts', 'src/main.ts'],
    format: ['esm'],
    target: 'node20',
    outDir: 'dist/src',
    clean: false,
    shims: true, // Provides __dirname, __filename shims automatically
    sourcemap: true,
    fixedExtension: false, // Use .js extension for ESM since package.json has type: module
    inlineOnly: false, // Disable warning about bundling dependencies
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
      '@huggingface/transformers',
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
    inlineOnly: false, // Disable warning about bundling dependencies
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
    inlineOnly: false, // Disable warning about bundling dependencies
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
