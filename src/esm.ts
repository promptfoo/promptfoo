import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import logger from './logger';
import { safeResolve } from './util/pathUtils';

// Global variable defined by tsup at build time
// undefined in development (tsx) and Jest tests
declare const BUILD_FORMAT: 'esm' | 'cjs' | undefined;

/**
 * ESM replacement for __dirname - guarded for dual CJS/ESM builds.
 *
 * This is the canonical way to get the current directory in dual ESM/CJS code.
 * Use this instead of implementing the try-catch pattern in each file.
 *
 * Build contexts:
 * - ESM (production/bundled): BUILD_FORMAT='esm', import.meta.url is valid
 * - CJS (library build): BUILD_FORMAT='cjs', import.meta.url may be empty, __dirname available
 * - Development (tsx): BUILD_FORMAT=undefined, import.meta.url is valid
 * - Vitest tests: BUILD_FORMAT=undefined, import.meta is valid in ESM mode
 *
 * The try-catch is necessary because `import.meta` syntax itself causes a SyntaxError
 * in CJS environments (Node require), not just an undefined value.
 */
export function getDirectory(): string {
  // In bundled CJS builds, skip the ESM path entirely - import.meta.url will be empty
  if (typeof BUILD_FORMAT !== 'undefined' && BUILD_FORMAT === 'cjs') {
    // @ts-ignore - __dirname exists in CJS builds
    return __dirname;
  }

  try {
    // Try ESM approach - import.meta.url is available in ESM and tsx
    // This will throw SyntaxError in CJS environments where import.meta is invalid syntax
    const url = import.meta.url;
    if (url && url !== '') {
      return path.dirname(fileURLToPath(url));
    }
  } catch {
    // Expected in CJS environments where import.meta syntax is invalid
    // Fall through to __dirname fallback
  }

  // Fall back to CJS __dirname (available in CJS builds)
  // @ts-ignore - __dirname exists in CJS but not in ESM types
  if (typeof __dirname !== 'undefined') {
    // @ts-ignore
    return __dirname;
  }

  // This should never happen in normal operation
  throw new Error(
    'Unable to determine directory: neither import.meta.url nor __dirname available. ' +
      'This indicates an unsupported module environment.',
  );
}

/**
 * ESM-only module loader - simplified without eval() or CommonJS fallback
 * Uses Node.js native ESM import with proper URL resolution
 */
export async function importModule(modulePath: string, functionName?: string) {
  logger.debug(
    `Attempting to import module: ${JSON.stringify({ resolvedPath: safeResolve(modulePath), moduleId: modulePath })}`,
  );

  try {
    if (modulePath.endsWith('.ts') || modulePath.endsWith('.mjs')) {
      logger.debug('TypeScript/ESM module detected, importing tsx/cjs');
      // @ts-ignore: It actually works
      await import('tsx/cjs');
    }

    const resolvedPath = pathToFileURL(safeResolve(modulePath));
    const resolvedPathStr = resolvedPath.toString();
    logger.debug(`Attempting ESM import from: ${resolvedPathStr}`);

    // Native dynamic import - no eval() needed in ESM-only environment
    const importedModule = await import(resolvedPathStr);

    const mod = importedModule?.default?.default || importedModule?.default || importedModule;
    logger.debug(
      `Successfully imported module: ${JSON.stringify({ resolvedPath, moduleId: modulePath })}`,
    );

    if (functionName) {
      logger.debug(`Returning named export: ${functionName}`);
      return mod[functionName];
    }
    return mod;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Provide helpful guidance for common CJS-in-ESM-context errors
    if (modulePath.endsWith('.js') && isCjsInEsmError(errorMessage)) {
      logger.error(`ESM import failed for ${modulePath}: ${errorMessage}`);
      logger.warn(
        `This .js file appears to use CommonJS syntax (require/module.exports). ` +
          `Since promptfoo v0.120.0, .js files are treated as ESM modules by default. ` +
          `To fix this, either:\n` +
          `  1. Rename the file to .cjs (e.g., ${modulePath.replace(/\.js$/, '.cjs')})\n` +
          `  2. Convert the file to use ESM syntax (import/export)\n` +
          `See: https://promptfoo.dev/docs/configuration/guide/#custom-providers`,
      );
    } else {
      logger.error(`ESM import failed: ${err}`);
    }

    // Log stack trace for debugging
    if ((err as any).stack) {
      logger.debug((err as any).stack);
    }

    throw err;
  }
}

/**
 * Detects if an error message indicates a CommonJS module being loaded in ESM context.
 */
function isCjsInEsmError(message: string): boolean {
  const cjsPatterns = [
    'require is not defined', // Direct require() call
    'module is not defined', // module.exports usage
    'exports is not defined', // exports.x usage
    '__dirname is not defined', // CJS global
    '__filename is not defined', // CJS global
    'Cannot use import statement', // Sometimes appears in mixed scenarios
    'ERR_REQUIRE_ESM', // Node error for requiring ESM
  ];
  return cjsPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Wrapper script directory types supported by promptfoo.
 */
export type WrapperType = 'python' | 'ruby' | 'golang';

/**
 * Configuration for each wrapper type specifying how to resolve its directory.
 */
const WRAPPER_CONFIG: Record<WrapperType, { devDir: string; subdir: string }> = {
  python: { devDir: 'python', subdir: 'python' },
  ruby: { devDir: 'ruby', subdir: 'ruby' },
  golang: { devDir: 'providers', subdir: 'golang' },
};

/**
 * Cache for resolved wrapper directories to avoid repeated path computations.
 */
const wrapperDirCache: Partial<Record<WrapperType, string>> = {};

/**
 * Get the directory containing wrapper scripts for a given language.
 *
 * Handles the difference between development and production paths:
 * - Development: Source files are in their respective directories (src/python/, src/ruby/, src/providers/)
 * - Production: Everything is bundled to dist/src/, wrapper files are in subdirectories (dist/src/python/, etc.)
 *
 * @param type - The wrapper type ('python', 'ruby', or 'golang')
 * @param callerDir - The directory of the calling module (from getDirectory())
 * @returns The resolved wrapper directory path
 *
 * @example
 * // In src/python/pythonUtils.ts (development)
 * getWrapperDir('python', getDirectory()) // Returns: /path/to/src/python
 *
 * // In dist/src/main.js (production)
 * getWrapperDir('python', getDirectory()) // Returns: /path/to/dist/src/python
 */
export function getWrapperDir(type: WrapperType, callerDir: string): string {
  // Check cache first
  if (wrapperDirCache[type]) {
    return wrapperDirCache[type];
  }

  const config = WRAPPER_CONFIG[type];
  const dirName = path.basename(callerDir);

  let result: string;
  if (dirName === config.devDir) {
    // In development: we're in the source directory
    // For python/ruby: already in the right place (src/python, src/ruby)
    // For golang: need to go up to src/ then into golang/
    if (type === 'golang') {
      result = path.join(path.dirname(callerDir), config.subdir);
    } else {
      result = callerDir;
    }
  } else {
    // In production: append the subdirectory
    result = path.join(callerDir, config.subdir);
  }

  wrapperDirCache[type] = result;
  return result;
}

/**
 * Clear the wrapper directory cache. Useful for testing.
 * @internal
 */
export function clearWrapperDirCache(): void {
  for (const key of Object.keys(wrapperDirCache) as WrapperType[]) {
    delete wrapperDirCache[key];
  }
}
