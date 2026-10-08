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

interface CopyTask {
  src: string;
  dest: string;
  recursive?: boolean;
  filter?: (src: string) => boolean;
}

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
function getHtmlFiles(): CopyTask[] {
  try {
    return fs
      .readdirSync(SRC)
      .filter((file) => file.endsWith('.html'))
      .map((file) => ({
        src: path.join(SRC, file),
        dest: path.join(DIST, 'src', file),
      }));
  } catch (error) {
    logError(`Failed to read src/ directory: ${error}`);
    return [];
  }
}

/**
 * Generate copy tasks for all wrapper scripts.
 * Uses WRAPPER_FILES to ensure consistency with src/esm.ts
 *
 * Wrapper files are copied to two locations:
 * 1. dist/src/{python,ruby,golang}/ - for CLI builds (entrypoint.js, main.js)
 * 2. dist/src/server/{python,ruby,golang}/ - for bundled server build (server/index.js)
 *
 * This is necessary because getWrapperDir() uses import.meta.url to determine
 * the base directory. In the bundled server, import.meta.url points to
 * dist/src/server/index.js, so wrapper files need to be at dist/src/server/{type}/.
 */
function getWrapperTasks(): CopyTask[] {
  // Destinations for wrapper files:
  // - dist/src/ for CLI (entrypoint.js, main.js use import.meta.url → dist/src/)
  // - dist/src/server/ for bundled server (server/index.js uses import.meta.url → dist/src/server/)
  return Object.entries(WRAPPER_FILES).flatMap(([wrapperType, files]) =>
    files.flatMap((file) =>
      WRAPPER_DEST_BASES.map((destBase) => ({
        src: path.join(SRC, wrapperType, file),
        dest: path.join(destBase, wrapperType, file),
      })),
    ),
  );
}

/**
 * Clean destination directories before copying to prevent stale files.
 * Only cleans specific subdirectories, not all of dist/.
 */
function cleanDestinations(_tasks: CopyTask[]): void {
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

  // Gather all copy tasks
  const copyTasks: CopyTask[] = [
    ...getHtmlFiles(),
    ...getWrapperTasks(),
    /**
     * Get the drizzle migration copy task with exclusion filter.
     */
    {
      src: path.join(ROOT, 'drizzle'),
      dest: path.join(DIST, 'drizzle'),
      recursive: true,
      filter: shouldCopyDrizzlePath,
    },
    /**
     * Get the proto files copy task for OTLP protobuf support.
     */
    {
      src: path.join(SRC, 'tracing', 'proto'),
      dest: path.join(DIST, 'src', 'tracing', 'proto'),
      recursive: true,
    },
  ];

  // Clean destinations to prevent stale files
  cleanDestinations(copyTasks);

  /**
   * Execute a single copy task.
   */
  // Execute copy tasks
  for (const task of copyTasks) {
    let copyError: string | undefined;
    try {
      if (fs.existsSync(task.src)) {
        fs.mkdirSync(path.dirname(task.dest), { recursive: true });
        fs.cpSync(task.src, task.dest, {
          recursive: task.recursive ?? false,
          filter: task.filter,
        });
      } else {
        copyError = `Source not found: ${task.src.replace(ROOT, '.')}`;
      }
    } catch (error) {
      copyError = `Copy failed: ${error}`;
    }
    if (copyError === undefined) {
      const relativePath = task.dest.replace(ROOT, '.');
      result.copied.push(relativePath);
      log(`Copied: ${task.src.replace(ROOT, '.')} -> ${relativePath}`);
    } else {
      result.errors.push(copyError);
      logError(copyError);
    }
  }

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
