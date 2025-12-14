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
import { execSync, spawnSync } from 'node:child_process';
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
 * Copy native node modules that can't be bundled.
 * These are platform-specific and include prebuilt binaries.
 */
function copyNativeModules(): void {
  console.log('\n[bundle] Copying native modules...');

  // Native modules that must be shipped alongside the bundle
  const nativeModules = ['better-sqlite3'];

  const nodeModulesDir = path.join(ROOT, 'node_modules');
  const bundleNodeModulesDir = path.join(BUNDLE_DIR, 'node_modules');

  // Track copied modules to avoid duplicates
  const copiedModules = new Set<string>();

  // Recursive function to copy a module and its dependencies
  function copyModuleWithDeps(moduleName: string, isRoot: boolean = false): void {
    if (copiedModules.has(moduleName)) {
      return;
    }

    const srcDir = path.join(nodeModulesDir, moduleName);
    const destDir = path.join(bundleNodeModulesDir, moduleName);

    if (!fs.existsSync(srcDir)) {
      if (isRoot) {
        console.warn(`[bundle] Warning: Native module not found: ${moduleName}`);
      }
      return;
    }

    copiedModules.add(moduleName);
    fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(srcDir, destDir, {
      recursive: true,
      filter: (src) => {
        const basename = path.basename(src);
        // Skip unnecessary files to reduce bundle size
        if (basename === 'test' || basename === 'tests' || basename === 'docs') {
          return false;
        }
        if (basename.endsWith('.md') && basename !== 'LICENSE.md') {
          return false;
        }
        return true;
      },
    });

    const label = isRoot ? 'native module' : 'dependency';
    console.log(`[bundle] Copied ${label}: ${moduleName}`);

    // Recursively copy dependencies
    const modulePackageJson = path.join(srcDir, 'package.json');
    if (fs.existsSync(modulePackageJson)) {
      const pkg = JSON.parse(fs.readFileSync(modulePackageJson, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };

      for (const depName of Object.keys(deps || {})) {
        copyModuleWithDeps(depName);
      }
    }
  }

  // Copy all native modules with their dependency trees
  for (const moduleName of nativeModules) {
    copyModuleWithDeps(moduleName, true);
  }

  // Create stub modules for optional externals that fail at import time
  // These modules are truly optional and only used for specific features
  createStubModules(bundleNodeModulesDir);
}

/**
 * Create stub modules for optional dependencies.
 * These prevent ESM import errors while still allowing the code to run
 * (features that need these modules will fail gracefully when used).
 */
function createStubModules(nodeModulesDir: string): void {
  console.log('\n[bundle] Creating stub modules for optional dependencies...');

  // Modules that need stubs with their commonly used named exports
  // Format: { name: string, exports: string[] }
  const stubModules: Array<{ name: string; exports: string[] }> = [
    // Heavy/optional native modules
    { name: 'playwright', exports: ['chromium', 'firefox', 'webkit', 'devices', 'errors', 'request', 'selectors'] },
    { name: 'playwright-core', exports: ['chromium', 'firefox', 'webkit', 'devices', 'errors', 'request', 'selectors'] },
    { name: '@playwright/browser-chromium', exports: [] },
    // Optional cloud SDKs
    { name: '@anthropic-ai/claude-agent-sdk', exports: ['Anthropic', 'Agent'] },
    { name: '@aws-sdk/client-bedrock-runtime', exports: ['BedrockRuntimeClient', 'InvokeModelCommand', 'InvokeModelWithResponseStreamCommand', 'ConverseCommand', 'ConverseStreamCommand'] },
    { name: '@aws-sdk/client-bedrock-agent-runtime', exports: ['BedrockAgentRuntimeClient', 'InvokeAgentCommand', 'RetrieveCommand'] },
    { name: '@aws-sdk/client-sagemaker-runtime', exports: ['SageMakerRuntimeClient', 'InvokeEndpointCommand'] },
    { name: '@azure/identity', exports: ['DefaultAzureCredential', 'ClientSecretCredential', 'ManagedIdentityCredential', 'AzureCliCredential'] },
    { name: '@azure/openai-assistants', exports: ['AssistantsClient'] },
    { name: '@azure/ai-projects', exports: ['AIProjectClient'] },
    { name: '@fal-ai/client', exports: ['fal'] },
    { name: '@ibm-cloud/watsonx-ai', exports: ['WatsonXAI'] },
    { name: '@ibm-generative-ai/node-sdk', exports: ['Client'] },
    { name: 'langfuse', exports: ['Langfuse', 'LangfuseTraceClient'] },
    { name: 'google-auth-library', exports: ['GoogleAuth', 'Compute', 'JWT', 'OAuth2Client'] },
    // Other optional deps
    { name: 'sharp', exports: [] },
    { name: 'pdf-parse', exports: [] },
    { name: 'read-excel-file', exports: [] },
    { name: 'fluent-ffmpeg', exports: [] },
    { name: 'jsdom', exports: ['JSDOM', 'VirtualConsole', 'CookieJar', 'ResourceLoader'] },
    { name: 'esbuild', exports: ['build', 'buildSync', 'transform', 'transformSync', 'version'] },
  ];

  for (const { name: moduleName, exports: namedExports } of stubModules) {
    const moduleDir = path.join(nodeModulesDir, moduleName);

    // Skip if real module was already copied
    if (fs.existsSync(moduleDir)) {
      continue;
    }

    fs.mkdirSync(moduleDir, { recursive: true });

    // Create package.json - use ESM
    const packageJson = {
      name: moduleName,
      version: '0.0.0-stub',
      main: 'index.mjs',
      module: 'index.mjs',
      type: 'module',
      exports: {
        '.': {
          import: './index.mjs',
          require: './index.cjs',
        },
      },
    };
    fs.writeFileSync(path.join(moduleDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Helper function for error message
    const errorMsg = (name: string) =>
      `The optional module '${name}' is not installed. Install it with: npm install ${name}`;

    // Create ESM stub with named exports
    const namedExportsCode = namedExports
      .map(
        (exp) => `
export const ${exp} = new Proxy(function ${exp}() {}, {
  get(target, prop) {
    if (prop === 'then' || prop === Symbol.toStringTag) return undefined;
    throw new Error(${JSON.stringify(errorMsg(moduleName))});
  },
  apply() {
    throw new Error(${JSON.stringify(errorMsg(moduleName))});
  },
  construct() {
    throw new Error(${JSON.stringify(errorMsg(moduleName))});
  }
});`
      )
      .join('\n');

    const esmStubCode = `
// Stub module for ${moduleName} - install with: npm install ${moduleName}
const createStub = (name) => new Proxy(function() {}, {
  get(target, prop) {
    if (prop === 'then' || prop === Symbol.toStringTag) return undefined;
    throw new Error(${JSON.stringify(errorMsg(moduleName))});
  },
  apply() { throw new Error(${JSON.stringify(errorMsg(moduleName))}); },
  construct() { throw new Error(${JSON.stringify(errorMsg(moduleName))}); }
});

${namedExportsCode}

const defaultExport = createStub('default');
export default defaultExport;
`.trim();

    fs.writeFileSync(path.join(moduleDir, 'index.mjs'), esmStubCode);

    // Create CJS stub for compatibility
    const cjsStubCode = `
'use strict';
const msg = ${JSON.stringify(errorMsg(moduleName))};
const handler = {
  get(t, p) { if (p === 'then' || p === Symbol.toStringTag) return undefined; throw new Error(msg); },
  apply() { throw new Error(msg); },
  construct() { throw new Error(msg); }
};
module.exports = new Proxy(function() {}, handler);
${namedExports.map((exp) => `module.exports.${exp} = module.exports;`).join('\n')}
`.trim();

    fs.writeFileSync(path.join(moduleDir, 'index.cjs'), cjsStubCode);
  }

  console.log(`[bundle] Created ${stubModules.length} stub modules`);
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
  // and native modules need to be loaded from disk relative to the executable
  const cjsBanner = `
'use strict';
const path = require('path');
const Module = require('module');

// Detect if running as SEA (Single Executable Application)
const isSEA = (() => {
  try {
    const sea = require('node:sea');
    return sea.isSea();
  } catch {
    return false;
  }
})();

// Get the directory containing the executable/script
const __EXEC_DIR__ = isSEA ? path.dirname(process.execPath) : __dirname;

// Asset directory for bundled distribution
const __BUNDLE_ASSETS__ = path.join(__EXEC_DIR__, 'assets');

// Override require for native modules in SEA mode
if (isSEA) {
  const nativeModules = ['better-sqlite3'];
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(id) {
    if (nativeModules.includes(id)) {
      // Load native module from disk next to the executable
      const modulePath = path.join(__EXEC_DIR__, 'node_modules', id);
      return originalRequire.call(this, modulePath);
    }
    return originalRequire.call(this, id);
  };
}
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
 * Post-process the CJS bundle to fix native module requires for SEA.
 *
 * In SEA context, require() for external modules doesn't work normally.
 * We replace require("module-name") with a dynamic require that uses
 * createRequire to load from the directory containing the executable.
 */
function patchNativeRequiresForSea(bundlePath: string): void {
  let content = fs.readFileSync(bundlePath, 'utf8');
  // Patch all external modules - both native and optional
  // In SEA context, any external module needs to be loaded via createRequire from disk
  const modulesToPatch = [...NATIVE_EXTERNALS, ...OPTIONAL_EXTERNALS];
  let patchCount = 0;

  for (const moduleName of modulesToPatch) {
    // Match require("module-name") or require('module-name')
    // Need to escape special regex characters in module names (like @, /)
    const escapedName = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`require\\("${escapedName}"\\)`, 'g'),
      new RegExp(`require\\('${escapedName}'\\)`, 'g'),
    ];

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        // Replace with a SEA-aware require that:
        // - In SEA mode: uses createRequire to load from executable directory
        // - In normal mode: falls back to regular require
        const replacement = `(function(){try{const sea=require("node:sea");if(sea.isSea()){const{createRequire}=require("module");const p=require("path");const r=createRequire(p.join(p.dirname(process.execPath),"node_modules","${moduleName}","package.json"));return r("${moduleName}")}}catch{}return require("${moduleName}")})()`;
        content = content.replace(pattern, replacement);
        patchCount += matches.length;
      }
    }
  }

  if (patchCount > 0) {
    fs.writeFileSync(bundlePath, content);
    console.log(`[bundle] Patched ${patchCount} external module require(s) for SEA compatibility`);
  }
}

/**
 * Generate a Node.js Single Executable Application (SEA).
 *
 * This takes the CJS bundle and creates a standalone binary that includes
 * Node.js itself. The binary can run without requiring Node.js to be installed.
 *
 * Process:
 * 1. Create SEA config JSON
 * 2. Generate blob using `node --experimental-sea-config`
 * 3. Copy Node.js binary
 * 4. Inject blob using postject
 * 5. Codesign on macOS
 */
async function generateSea(): Promise<boolean> {
  console.log('\n[bundle] Generating Node.js Single Executable Application...');

  const cjsBundle = path.join(BUNDLE_DIR, 'promptfoo.cjs');
  const seaConfig = path.join(BUNDLE_DIR, 'sea-config.json');
  const seaBlob = path.join(BUNDLE_DIR, 'sea-prep.blob');

  // Determine output binary name based on platform
  const platform = process.platform;
  const binaryName = platform === 'win32' ? 'promptfoo.exe' : 'promptfoo';
  const seaBinary = path.join(BUNDLE_DIR, binaryName);

  // Step 1: Create SEA config
  console.log('[bundle] Creating SEA config...');
  const seaConfigContent = {
    main: cjsBundle,
    output: seaBlob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false, // Snapshots don't work well with complex apps
    useCodeCache: true, // Improves startup time
  };
  fs.writeFileSync(seaConfig, JSON.stringify(seaConfigContent, null, 2));

  // Step 2: Generate blob
  console.log('[bundle] Generating SEA blob...');
  try {
    execSync(`node --experimental-sea-config "${seaConfig}"`, {
      cwd: BUNDLE_DIR,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('[bundle] Failed to generate SEA blob:', error);
    return false;
  }

  if (!fs.existsSync(seaBlob)) {
    console.error('[bundle] SEA blob was not created');
    return false;
  }

  const blobStats = fs.statSync(seaBlob);
  console.log(`[bundle] SEA blob size: ${formatSize(blobStats.size)}`);

  // Step 3: Copy Node.js binary
  console.log('[bundle] Copying Node.js binary...');
  const nodeBinary = process.execPath;
  fs.copyFileSync(nodeBinary, seaBinary);

  // On macOS, need to remove signature before injection
  if (platform === 'darwin') {
    console.log('[bundle] Removing existing code signature (macOS)...');
    try {
      execSync(`codesign --remove-signature "${seaBinary}"`, { stdio: 'inherit' });
    } catch (_error) {
      // May fail if not signed, that's OK
    }
  }

  // Step 4: Inject blob using postject
  console.log('[bundle] Injecting SEA blob into binary...');

  // Check if postject is installed
  const postjectPath = path.join(ROOT, 'node_modules', '.bin', 'postject');
  const hasPostject = fs.existsSync(postjectPath) || fs.existsSync(postjectPath + '.cmd');

  if (!hasPostject) {
    console.error('[bundle] postject not found. Install with: npm install -D postject');
    return false;
  }

  const postjectArgs = [
    seaBinary,
    'NODE_SEA_BLOB',
    seaBlob,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ];

  // macOS specific options
  if (platform === 'darwin') {
    postjectArgs.push('--macho-segment-name', 'NODE_SEA');
  }

  try {
    const result = spawnSync('npx', ['postject', ...postjectArgs], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
    if (result.status !== 0) {
      console.error('[bundle] postject failed with exit code:', result.status);
      return false;
    }
  } catch (error) {
    console.error('[bundle] Failed to inject SEA blob:', error);
    return false;
  }

  // Step 5: Re-sign on macOS
  if (platform === 'darwin') {
    console.log('[bundle] Re-signing binary (macOS)...');
    try {
      execSync(`codesign --sign - "${seaBinary}"`, { stdio: 'inherit' });
    } catch (error) {
      console.error('[bundle] Warning: Failed to re-sign binary:', error);
      // Continue anyway, ad-hoc signing might not be required for local use
    }
  }

  // Verify the binary works
  console.log('[bundle] Verifying SEA binary...');
  try {
    const versionResult = spawnSync(seaBinary, ['--version'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    if (versionResult.status === 0) {
      console.log(`[bundle] SEA binary verified: ${versionResult.stdout.trim()}`);
    } else {
      console.error('[bundle] Warning: SEA binary verification returned non-zero exit code');
      console.error('stdout:', versionResult.stdout);
      console.error('stderr:', versionResult.stderr);
    }
  } catch (error) {
    console.error('[bundle] Warning: Failed to verify SEA binary:', error);
  }

  // Report final size
  const seaStats = fs.statSync(seaBinary);
  console.log(`\n[bundle] SEA binary complete!`);
  console.log(`  Output: ${seaBinary.replace(ROOT, '.')}`);
  console.log(`  Size: ${formatSize(seaStats.size)}`);

  // Cleanup intermediate files
  fs.rmSync(seaConfig);
  fs.rmSync(seaBlob);

  return true;
}

/**
 * Main bundle function.
 */
async function main(): Promise<void> {
  const buildSea = process.argv.includes('--sea');

  console.log('[bundle] Starting bundle process...');
  console.log(`[bundle] Version: ${packageJson.version}`);
  console.log(`[bundle] Output directory: ${BUNDLE_DIR.replace(ROOT, '.')}`);
  if (buildSea) {
    console.log('[bundle] SEA mode: Also building CJS bundle for Node.js SEA');
  }

  // Prepare bundle directory
  prepareBundleDir();

  // Copy assets first
  console.log('\n[bundle] Copying assets...');
  copyAssets();

  // Copy native modules (better-sqlite3, etc.)
  copyNativeModules();

  // Create ESM bundle (default)
  console.log('\n[bundle] Creating ESM bundle...');
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

  console.log('\n[bundle] ESM bundle complete!');
  console.log(`  Output: ${result.outputFile.replace(ROOT, '.')}`);
  console.log(`  Size: ${formatSize(result.bundleSize)}`);

  // Create CJS bundle for SEA if requested
  if (buildSea) {
    console.log('\n[bundle] Creating CJS bundle for SEA...');
    const seaResult = await createBundle({
      format: 'cjs',
      outputFile: path.join(BUNDLE_DIR, 'promptfoo.cjs'),
      forSea: true,
    });

    if (!seaResult.success) {
      console.error('\n[bundle] SEA bundle failed with errors:');
      for (const error of seaResult.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    console.log('\n[bundle] CJS bundle for SEA complete!');
    console.log(`  Output: ${seaResult.outputFile.replace(ROOT, '.')}`);
    console.log(`  Size: ${formatSize(seaResult.bundleSize)}`);

    // Post-process the CJS bundle to fix native module requires for SEA
    console.log('\n[bundle] Post-processing CJS bundle for SEA native modules...');
    patchNativeRequiresForSea(seaResult.outputFile);

    // Generate the actual SEA binary
    const seaSuccess = await generateSea();
    if (!seaSuccess) {
      console.error('\n[bundle] SEA generation failed');
      process.exit(1);
    }
  }

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
