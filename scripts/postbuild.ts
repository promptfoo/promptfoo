/**
 * Post-build script that copies non-TypeScript assets to the dist directory.
 *
 * This script runs automatically after the TypeScript build (tsdown) completes.
 * It handles:
 * - HTML template files (all *.html in src/)
 * - Python/Go/Ruby wrapper scripts for custom providers
 * - Drizzle ORM migration files
 * - ESM package.json marker
 * - CLI executable permissions
 *
 * @module scripts/postbuild
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');
const WRAPPER_DEST_BASES = [path.join(DIST, 'src'), path.join(DIST, 'src', 'server')];

/**
 * Wrapper types supported by the build.
 * IMPORTANT: Must match WrapperType in src/esm.ts (used by getWrapperDir()).
 * If you add a new wrapper type, update both files.
 */

/**
 * Wrapper files for each language type.
 * Maps wrapper type to the list of files that should be copied.
 */
const WRAPPER_FILES = {
  python: ['wrapper.py', 'persistent_wrapper.py'],
  ruby: ['wrapper.rb'],
  golang: ['wrapper.go'],
} as const;

/**
 * Files/patterns to exclude when copying the drizzle directory.
 */
const DRIZZLE_EXCLUDE_PATTERNS = ['.md', 'CLAUDE', 'AGENTS'];

export function shouldCopyDrizzlePath(src: string): boolean {
  const basename = path.basename(src);
  return !DRIZZLE_EXCLUDE_PATTERNS.some((pattern) => basename.includes(pattern));
}

/**
 * Critical build outputs that must exist for the build to be valid.
 */
const REQUIRED_BUILD_OUTPUTS = [
  'dist/src/entrypoint.js', // CLI entry (Node version check wrapper)
  'dist/src/main.js', // CLI main module
  'dist/src/contracts.js', // ESM contracts subpath
  'dist/src/contracts.cjs', // CJS contracts subpath
  'dist/src/contracts.d.ts', // ESM contracts declarations
  'dist/src/contracts.d.cts', // CJS contracts declarations
  'dist/src/index.js', // ESM library entry
  'dist/src/index.cjs', // CJS library entry
  'dist/src/server/index.js', // Server entry
];

interface PostbuildResult {
  success: boolean;
  copied: string[];
  errors: string[];
}

/**
 * Logs a message to stdout with consistent formatting.
 */
function log(message: string): void {
  console.log(`[postbuild] ${message}`);
}

/**
 * Logs an error message to stderr with consistent formatting.
 */
function logError(message: string): void {
  console.error(`[postbuild] ERROR: ${message}`);
}

/**
 * Find all HTML files in src/ directory (non-recursive).
 */
function getHtmlFiles(): string[] {
  try {
    return fs.readdirSync(SRC).filter((file) => file.endsWith('.html'));
  } catch (error) {
    logError(`Failed to read src/ directory: ${error}`);
    return [];
  }
}

/**
 * Clean destination directories before copying to prevent stale files.
 * Only cleans specific subdirectories, not all of dist/.
 */
function cleanDestinations(): void {
  // Clean wrapper directories (both at dist/src/ and dist/src/server/)
  for (const base of WRAPPER_DEST_BASES) {
    for (const wrapperType of Object.keys(WRAPPER_FILES)) {
      const wrapperDest = path.join(base, wrapperType);
      if (fs.existsSync(wrapperDest)) {
        fs.rmSync(wrapperDest, { recursive: true, force: true });
      }
    }
  }

  // Clean drizzle directory
  const drizzleDest = path.join(DIST, 'drizzle');
  if (fs.existsSync(drizzleDest)) {
    fs.rmSync(drizzleDest, { recursive: true, force: true });
  }
}

/**
 * Main postbuild function.
 */
export function postbuild(): PostbuildResult {
  const result: PostbuildResult = {
    success: true,
    copied: [],
    errors: [],
  };

  log('Starting postbuild...');

  // Verify tsdown produced the expected outputs first
  /**
   * Verify that all critical build outputs exist.
   */
  const missingOutputs = REQUIRED_BUILD_OUTPUTS.filter(
    (outputPath) => !fs.existsSync(path.join(ROOT, outputPath)),
  );
  if (missingOutputs.length > 0) {
    for (const missing of missingOutputs) {
      result.errors.push(`Missing build output: ${missing}`);
    }
    logError('tsdown build appears to have failed. Missing outputs:');
    for (const missing of missingOutputs) {
      logError(`  - ${missing}`);
    }
    result.success = false;
    return result;
  }

  const htmlFiles = getHtmlFiles();
  cleanDestinations();

  function copy(src: string, dest: string, options: fs.CopySyncOptions = {}): void {
    let copyError: string | undefined;
    try {
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.cpSync(src, dest, options);
      } else {
        copyError = `Source not found: ${src.replace(ROOT, '.')}`;
      }
    } catch (error) {
      copyError = `Copy failed: ${error}`;
    }
    if (copyError === undefined) {
      const relativePath = dest.replace(ROOT, '.');
      result.copied.push(relativePath);
      log(`Copied: ${src.replace(ROOT, '.')} -> ${relativePath}`);
    } else {
      result.errors.push(copyError);
      logError(copyError);
    }
  }

  for (const file of htmlFiles) {
    copy(path.join(SRC, file), path.join(DIST, 'src', file));
  }

  // getWrapperDir() locates scripts relative to the bundle. The CLI and library
  // live in dist/src, while the standalone server can resolve from dist/src/server.
  for (const [type, files] of Object.entries(WRAPPER_FILES)) {
    for (const file of files) {
      for (const base of WRAPPER_DEST_BASES) {
        copy(path.join(SRC, type, file), path.join(base, type, file));
      }
    }
  }
  copy(path.join(ROOT, 'drizzle'), path.join(DIST, 'drizzle'), {
    recursive: true,
    filter: shouldCopyDrizzlePath,
  });
  copy(path.join(SRC, 'tracing', 'proto'), path.join(DIST, 'src', 'tracing', 'proto'), {
    recursive: true,
  });

  // Create ESM package.json marker for dist/src
  const distSrcPackageJson = path.join(DIST, 'src', 'package.json');
  try {
    fs.writeFileSync(distSrcPackageJson, JSON.stringify({ type: 'module' }, null, 2) + '\n');
    log('Created: ./dist/src/package.json');
  } catch (error) {
    result.errors.push(`Failed to create ESM marker: ${error}`);
    logError(`Failed to create ESM marker: ${error}`);
  }

  // Make CLI executables (no-op on Windows, but doesn't hurt)
  const cliExecutables = ['entrypoint.js', 'main.js'];
  for (const executable of cliExecutables) {
    const execPath = path.join(DIST, 'src', executable);
    try {
      fs.chmodSync(execPath, 0o755);
      log(`Made executable: ./dist/src/${executable}`);
    } catch (error) {
      // chmod may fail on Windows - this is acceptable
      log(`Note: chmod failed (expected on Windows): ${error}`);
    }
  }

  result.success = result.errors.length === 0;
  if (result.success) {
    log(`Postbuild complete. Copied ${result.copied.length} items.`);
  } else {
    logError(`Postbuild failed with ${result.errors.length} error(s).`);
  }

  return result;
}

// Run if executed directly (not when imported for testing)
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const result = postbuild();
  if (!result.success) {
    process.exit(1);
  }
}
