import { createRequire } from 'node:module';
import { readFileSync } from 'fs';

import { defineConfig, type UserConfig } from 'tsdown';

const require = createRequire(import.meta.url);
const semver = require('semver') as typeof import('semver');

// Read package.json for version constants
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

// Normalize the package.json engines range into comparator sets that the zero-dependency
// CLI entrypoint can evaluate before importing any other modules.
const enginesNode: string = packageJson.engines?.node ?? '>=22.22.0';
let nodeEngineComparatorSets: Array<
  Array<{ operator: '' | '=' | '>' | '>=' | '<' | '<='; version: string }>
>;
try {
  nodeEngineComparatorSets = new semver.Range(enginesNode).set.map((comparatorSet) =>
    comparatorSet.map((comparator) => ({
      operator: comparator.operator,
      version: comparator.semver.version,
    })),
  );
} catch {
  console.warn(
    `[tsdown] Warning: Could not parse engines.node "${enginesNode}". Defaulting to >=22.22.0.`,
  );
  nodeEngineComparatorSets = [[{ operator: '>=', version: '22.22.0' }]];
}

// Build-time constants injected into all builds
// These replace the __PROMPTFOO_*__ placeholders in source files
// Note: tsdown define requires all values to be strings
const versionDefines = {
  __PROMPTFOO_VERSION__: JSON.stringify(packageJson.version),
  __PROMPTFOO_POSTHOG_KEY__: JSON.stringify(process.env.PROMPTFOO_POSTHOG_KEY || ''),
  __PROMPTFOO_NODE_ENGINE_RANGE__: JSON.stringify(enginesNode),
  __PROMPTFOO_NODE_ENGINE_COMPARATOR_SETS__: JSON.stringify(nodeEngineComparatorSets),
};

// Use `npm run build:clean` to avoid racing concurrent builds in the shared output directory.
const sharedBuildOptions = {
  target: 'node22',
  outDir: 'dist/src',
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: /^[a-z@][^:]*/,
    onlyBundle: false,
  },
} as const;

function esmBuildOptions(
  entry: UserConfig['entry'],
  options: Pick<UserConfig, 'treeshake' | 'dts'> = {},
) {
  return {
    ...sharedBuildOptions,
    entry,
    format: ['esm' as const],
    ...options,
    shims: true, // Provides __dirname, __filename shims automatically
    fixedExtension: false, // Use .js extension for ESM since package.json has type: module
    define: {
      ...versionDefines,
      BUILD_FORMAT: '"esm"',
      'process.env.BUILD_FORMAT': '"esm"',
    },
  };
}

export default defineConfig([
  // Server (ESM only) - stable path for workflows
  // Only public library entry points emit declarations. The server's index declaration
  // otherwise races the library build for dist/src/index.d.ts.
  esmBuildOptions({ 'server/index': 'src/server/index.ts' }, { dts: false }),
  // CLI binary (ESM only)
  {
    ...esmBuildOptions(['src/entrypoint.ts', 'src/main.ts'], { dts: false }),
    outputOptions: {
      banner: '#!/usr/bin/env node',
    },
  },
  // Library ESM build
  esmBuildOptions(
    {
      contracts: 'src/contracts.ts',
      index: 'src/index.ts',
    },
    { treeshake: true },
  ), // Ensure library ESM build has shims
  // Library CJS build for compatibility
  {
    ...sharedBuildOptions,
    // Native require(ESM) returns Chalk's namespace, while the CJS interop wrapper
    // expects its default function. Bundle this ESM-only dependency so logging works
    // without changing the require conditions of other dependencies (notably Zod).
    deps: {
      ...sharedBuildOptions.deps,
      neverBundle: /^(?!chalk(?:\/|$))[a-z@][^:]*/,
      alwaysBundle: ['chalk'],
    },
    entry: {
      contracts: 'src/contracts.ts',
      index: 'src/index.ts',
    },
    format: ['cjs'],
    fixedExtension: true, // Use .cjs extension for CJS output
    define: {
      ...versionDefines,
      BUILD_FORMAT: '"cjs"',
      'process.env.BUILD_FORMAT': '"cjs"',
    },
  },
]);
