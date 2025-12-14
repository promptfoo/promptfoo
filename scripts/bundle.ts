/**
 * Bundle script for creating a self-contained promptfoo CLI.
 *
 * This script creates a single bundled JavaScript file with all dependencies
 * included, suitable for distribution via pip install or standalone binary.
 *
 * Native modules (better-sqlite3) are kept external and must be shipped alongside.
 *
 * Usage:
 *   npx tsx scripts/bundle.ts
 *
 * Output:
 *   bundle/promptfoo.mjs - Bundled CLI
 *   bundle/assets/       - Required assets (drizzle, wrappers, etc.)
 *
 * @module scripts/bundle
 */

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const BUNDLE_DIR = path.join(ROOT, 'bundle');

// Read package.json for version constants
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/**
 * Native modules that cannot be bundled and must be shipped separately.
 * These will be loaded at runtime from the extracted location.
 */
const NATIVE_EXTERNALS = [
  'better-sqlite3',
  'sharp',
  'playwright',
  'playwright-core',
  '@playwright/browser-chromium',
  '@swc/core',
  'fsevents',
  // These have native bindings on some platforms
  'cpu-features',
  'ssh2',
];

/**
 * Modules that should remain external because they're optional
 * or have complex initialization that doesn't bundle well.
 */
const OPTIONAL_EXTERNALS = [
  // Optional provider dependencies - users install if needed
  '@anthropic-ai/claude-agent-sdk',
  '@aws-sdk/client-bedrock-runtime',
  '@aws-sdk/client-bedrock-agent-runtime',
  '@aws-sdk/client-sagemaker-runtime',
  '@azure/identity',
  '@azure/openai-assistants',
  '@azure/ai-projects',
  '@fal-ai/client',
  '@ibm-cloud/watsonx-ai',
  '@ibm-generative-ai/node-sdk',
  'langfuse',
  'google-auth-library',
  // Heavy optional deps
  'pdf-parse',
  'read-excel-file',
  'fluent-ffmpeg',
  // Modules that don't bundle well due to require.resolve usage
  'jsdom',
  'esbuild',
];

interface BundleResult {
  success: boolean;
  outputFile: string;
  errors: string[];
  warnings: string[];
  bundleSize: number;
}

interface BundleOptions {
  format: 'esm' | 'cjs';
  outputFile: string;
  forSea?: boolean;
}

/**
 * Clean and create bundle directory.
 */
function prepareBundleDir(): void {
  if (fs.existsSync(BUNDLE_DIR)) {
    fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
  fs.mkdirSync(path.join(BUNDLE_DIR, 'assets'), { recursive: true });
}

/**
 * Copy required assets to bundle directory.
 */
function copyAssets(): void {
  const assets = [
    // Drizzle migrations (kept in assets/)
    { src: path.join(ROOT, 'drizzle'), dest: path.join(BUNDLE_DIR, 'assets', 'drizzle') },
    // Python wrapper - must be at bundle/python/ (matches WRAPPER_SUBDIRS in code)
    {
      src: path.join(ROOT, 'src', 'python', 'wrapper.py'),
      dest: path.join(BUNDLE_DIR, 'python', 'wrapper.py'),
    },
    {
      src: path.join(ROOT, 'src', 'python', 'persistent_wrapper.py'),
      dest: path.join(BUNDLE_DIR, 'python', 'persistent_wrapper.py'),
    },
    // Ruby wrapper - must be at bundle/ruby/ (matches WRAPPER_SUBDIRS in code)
    {
      src: path.join(ROOT, 'src', 'ruby', 'wrapper.rb'),
      dest: path.join(BUNDLE_DIR, 'ruby', 'wrapper.rb'),
    },
    // Go wrapper - must be at bundle/golang/ (matches WRAPPER_SUBDIRS in code)
    {
      src: path.join(ROOT, 'src', 'golang', 'wrapper.go'),
      dest: path.join(BUNDLE_DIR, 'golang', 'wrapper.go'),
    },
    // Proto files for OTLP
    {
      src: path.join(ROOT, 'src', 'tracing', 'proto'),
      dest: path.join(BUNDLE_DIR, 'assets', 'proto'),
    },
    // HTML templates (built app)
    {
      src: path.join(ROOT, 'dist', 'src', 'app'),
      dest: path.join(BUNDLE_DIR, 'assets', 'app'),
    },
  ];

  for (const asset of assets) {
    if (fs.existsSync(asset.src)) {
      fs.mkdirSync(path.dirname(asset.dest), { recursive: true });
      fs.cpSync(asset.src, asset.dest, {
        recursive: true,
        filter: (src) => {
          const basename = path.basename(src);
          // Skip markdown docs and cache files
          return !basename.endsWith('.md') && !basename.startsWith('.');
        },
      });
      console.log(`[bundle] Copied: ${asset.src.replace(ROOT, '.')} -> ${asset.dest.replace(ROOT, '.')}`);
    } else {
      console.warn(`[bundle] Warning: Asset not found: ${asset.src.replace(ROOT, '.')}`);
    }
  }
}

/**
 * Create the esbuild bundle.
 */
async function createBundle(options?: BundleOptions): Promise<BundleResult> {
  const format = options?.format ?? 'esm';
  const outputFile = options?.outputFile ?? path.join(BUNDLE_DIR, 'promptfoo.mjs');
  const forSea = options?.forSea ?? false;

  // Node.js built-in modules that should remain external
  const NODE_BUILTINS = [
    'assert',
    'async_hooks',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'constants',
    'crypto',
    'dgram',
    'dns',
    'domain',
    'events',
    'fs',
    'http',
    'http2',
    'https',
    'inspector',
    'module',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'punycode',
    'querystring',
    'readline',
    'repl',
    'stream',
    'string_decoder',
    'sys',
    'timers',
    'tls',
    'trace_events',
    'tty',
    'url',
    'util',
    'v8',
    'vm',
    'wasi',
    'worker_threads',
    'zlib',
  ];

  // Banner for ESM format - sets up __dirname, __filename, require for ESM
  const esmBanner = `
import { createRequire as __bundle_createRequire } from 'module';
import { fileURLToPath as __bundle_fileURLToPath } from 'url';
import { dirname as __bundle_dirname, join as __bundle_join } from 'path';

const __filename = __bundle_fileURLToPath(import.meta.url);
const __dirname = __bundle_dirname(__filename);
const require = __bundle_createRequire(import.meta.url);

// Asset directory for bundled distribution
const __BUNDLE_ASSETS__ = __bundle_join(__dirname, 'assets');
`.trim();

  // Banner for CJS format (used in SEA builds)
  // For SEA, we need to handle the fact that __dirname might point to the executable
  const cjsBanner = `
'use strict';
const path = require('path');

// Asset directory for bundled distribution
// In SEA mode, assets are next to the executable
const __BUNDLE_ASSETS__ = path.join(__dirname, 'assets');
`.trim();

  // Footer for CJS to handle async entry point
  const cjsFooter = forSea
    ? ''
    : '';

  try {
    const result = await esbuild.build({
      entryPoints: [path.join(ROOT, 'src', 'main.ts')],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: format,
      outfile: outputFile,
      minify: forSea, // Minify for SEA to reduce binary size
      sourcemap: false,
      metafile: true,

      // Keep native, optional, and Node built-in modules external
      external: [
        ...NATIVE_EXTERNALS,
        ...OPTIONAL_EXTERNALS,
        ...NODE_BUILTINS,
        ...NODE_BUILTINS.map((m) => `node:${m}`),
      ],

      // Inject version and build constants
      define: {
        __PROMPTFOO_VERSION__: JSON.stringify(packageJson.version),
        __PROMPTFOO_POSTHOG_KEY__: JSON.stringify(process.env.PROMPTFOO_POSTHOG_KEY || ''),
        __PROMPTFOO_ENGINES_NODE__: JSON.stringify(packageJson.engines.node),
        __PROMPTFOO_INSTALL_METHOD__: JSON.stringify(
          forSea ? 'binary' : process.env.PROMPTFOO_INSTALL_METHOD || 'bundle'
        ),
        BUILD_FORMAT: JSON.stringify(format),
        'process.env.BUILD_FORMAT': JSON.stringify(format),
      },

      // Handle __dirname/__filename appropriately for format
      banner: {
        js: format === 'esm' ? esmBanner : cjsBanner,
      },

      footer: cjsFooter ? { js: cjsFooter } : undefined,

      // Preserve dynamic imports for optional features
      splitting: false,

      // Log level
      logLevel: 'info',
    });

    // Use the original ESM output file
    const actualOutputFile = outputFile;

    // Get bundle size
    const stats = fs.statSync(actualOutputFile);
    const bundleSize = stats.size;

    // Add shebang for CLI execution
    const content = fs.readFileSync(actualOutputFile, 'utf8');
    fs.writeFileSync(actualOutputFile, `#!/usr/bin/env node\n${content}`);
    fs.chmodSync(actualOutputFile, 0o755);

    // Write metafile for analysis
    if (result.metafile) {
      fs.writeFileSync(
        path.join(BUNDLE_DIR, 'metafile.json'),
        JSON.stringify(result.metafile, null, 2)
      );
    }

    return {
      success: true,
      outputFile: actualOutputFile,
      errors: [],
      warnings: result.warnings.map((w) => w.text),
      bundleSize,
    };
  } catch (error) {
    const buildError = error as esbuild.BuildFailure;
    return {
      success: false,
      outputFile,
      errors: buildError.errors?.map((e) => e.text) || [String(error)],
      warnings: buildError.warnings?.map((w) => w.text) || [],
      bundleSize: 0,
    };
  }
}

/**
 * Format bytes to human-readable size.
 */
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Main bundle function.
 */
async function main(): Promise<void> {
  console.log('[bundle] Starting bundle process...');
  console.log(`[bundle] Version: ${packageJson.version}`);
  console.log(`[bundle] Output directory: ${BUNDLE_DIR.replace(ROOT, '.')}`);

  // Prepare bundle directory
  prepareBundleDir();

  // Copy assets first
  console.log('\n[bundle] Copying assets...');
  copyAssets();

  // Create bundle
  console.log('\n[bundle] Creating esbuild bundle...');
  const result = await createBundle();

  if (!result.success) {
    console.error('\n[bundle] Bundle failed with errors:');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    console.warn('\n[bundle] Warnings:');
    for (const warning of result.warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  console.log('\n[bundle] Bundle complete!');
  console.log(`  Output: ${result.outputFile.replace(ROOT, '.')}`);
  console.log(`  Size: ${formatSize(result.bundleSize)}`);

  // List external dependencies
  console.log('\n[bundle] External dependencies (must be available at runtime):');
  console.log('  Native modules:');
  for (const dep of NATIVE_EXTERNALS) {
    console.log(`    - ${dep}`);
  }
  console.log('  Optional modules (install if needed):');
  for (const dep of OPTIONAL_EXTERNALS.slice(0, 5)) {
    console.log(`    - ${dep}`);
  }
  console.log(`    ... and ${OPTIONAL_EXTERNALS.length - 5} more`);
}

main().catch((error) => {
  console.error('[bundle] Fatal error:', error);
  process.exit(1);
});
