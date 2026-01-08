import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

import { resolveModulePath } from 'exsolve';
import logger from './logger';
import { safeResolve } from './util/pathUtils';

/**
 * Supported wrapper script types for language-specific providers.
 */
export type WrapperType = 'python' | 'ruby' | 'golang';

/**
 * Mapping of wrapper types to their subdirectory names.
 * These correspond to the directory structure under src/ and dist/src/.
 */
const WRAPPER_SUBDIRS: Record<WrapperType, string> = {
  python: 'python',
  ruby: 'ruby',
  golang: 'golang',
};

/**
 * Cache for wrapper directory paths to avoid repeated path construction.
 */
const wrapperDirCache: Partial<Record<WrapperType, string>> = {};

/**
 * Returns the directory containing wrapper scripts for the specified language.
 *
 * This function provides a consistent way to locate wrapper scripts (wrapper.py,
 * wrapper.rb, wrapper.go, etc.) that works correctly in both development and
 * production (bundled) environments.
 *
 * Directory resolution:
 * - Development (tsx): src/{python|ruby|golang}/
 * - Production (bundled): dist/src/{python|ruby|golang}/
 *
 * Results are cached for performance.
 *
 * @param type - The wrapper type ('python', 'ruby', or 'golang')
 * @returns The absolute path to the wrapper directory
 *
 * @example
 * ```typescript
 * // Get Python wrapper path
 * const pythonDir = getWrapperDir('python');
 * const wrapperPath = path.join(pythonDir, 'wrapper.py');
 *
 * // Get Ruby wrapper path
 * const rubyDir = getWrapperDir('ruby');
 * const wrapperPath = path.join(rubyDir, 'wrapper.rb');
 * ```
 */
export function getWrapperDir(type: WrapperType): string {
  if (wrapperDirCache[type]) {
    return wrapperDirCache[type]!;
  }

  const baseDir = getDirectory();
  const result = path.join(baseDir, WRAPPER_SUBDIRS[type]);
  wrapperDirCache[type] = result;

  logger.debug(`Resolved ${type} wrapper directory: ${result}`);
  return result;
}

/**
 * Clears the wrapper directory cache.
 * Primarily useful for testing to ensure fresh path resolution.
 */
export function clearWrapperDirCache(): void {
  for (const key of Object.keys(wrapperDirCache) as WrapperType[]) {
    delete wrapperDirCache[key];
  }
}

/**
 * Resolves the entry point path for an npm package, handling ESM-only packages
 * with restrictive `exports` fields.
 *
 * ## Why this function exists
 *
 * Some ESM-only packages (like `@openai/codex-sdk`) have restrictive `exports` fields:
 *
 * ```json
 * {
 *   "type": "module",
 *   "exports": {
 *     ".": { "import": "./dist/index.js" }
 *   }
 * }
 * ```
 *
 * This causes problems with Node.js's `require.resolve()`:
 * - `require.resolve('@openai/codex-sdk')` fails with "No exports main defined"
 *   because there's no `"require"` or `"default"` condition.
 *
 * ## Solution
 *
 * This function uses `exsolve` which implements Node's ESM resolution algorithm,
 * correctly handling all `exports` field variations:
 * - Direct string exports: `"exports": "./index.js"`
 * - Shorthand object: `"exports": { ".": "./index.js" }`
 * - Conditional exports: `"exports": { ".": { "import": "./index.js" } }`
 * - Nested conditionals, array fallbacks, pattern exports, etc.
 *
 * @param packageName - The npm package name (e.g., '@openai/codex-sdk')
 * @param baseDir - The directory to resolve from (should contain node_modules)
 * @returns The absolute path to the package entry point, or null if not found
 *
 * @example
 * ```typescript
 * // Resolve from current directory
 * const codexPath = resolvePackageEntryPoint('@openai/codex-sdk', process.cwd());
 * if (codexPath) {
 *   const module = await importModule(codexPath);
 * }
 * ```
 */
export function resolvePackageEntryPoint(packageName: string, baseDir: string): string | null {
  // Use exsolve which implements Node's ESM resolution algorithm
  // The `from` URL tells exsolve where to start looking for node_modules
  const from = pathToFileURL(path.join(baseDir, 'package.json')).href;

  const resolved = resolveModulePath(packageName, {
    from,
    // Conditions in priority order: Node.js-specific, ESM, CommonJS, default fallback
    conditions: ['node', 'import', 'require', 'default'],
    // Return undefined instead of throwing when package not found
    try: true,
  });

  // Normalize the path to use platform-specific separators (forward slashes on Unix, backslashes on Windows)
  return resolved ? path.normalize(resolved) : null;
}

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

    // Fall back to vm-based CJS execution for .js files that use CJS syntax
    // Note: createRequire() doesn't work for .js files in "type": "module" packages
    // because Node.js still treats them as ESM based on package.json.
    // We use Node's vm module to execute the code with proper CJS globals.
    if (modulePath.endsWith('.js') && isCjsInEsmError(errorMessage)) {
      logger.debug(
        `ESM import failed for ${modulePath}, attempting vm-based CJS fallback: ${errorMessage}`,
      );

      try {
        const resolvedPath = safeResolve(modulePath);
        const mod = loadCjsModule(resolvedPath);
        logger.debug(
          `Successfully loaded module via CJS fallback: ${JSON.stringify({ resolvedPath, moduleId: modulePath })}`,
        );

        if (functionName) {
          logger.debug(`Returning named export: ${functionName}`);
          return mod[functionName];
        }
        return mod;
      } catch (cjsErr) {
        // If CJS fallback also fails, throw a combined error with both details
        const cjsErrorMessage = cjsErr instanceof Error ? cjsErr.message : String(cjsErr);
        logger.error(`ESM import failed for ${modulePath}: ${errorMessage}`);
        logger.error(`CJS fallback also failed: ${cjsErrorMessage}`);

        // Create a combined error that includes both failure reasons
        const combinedError = new Error(
          `Failed to load module ${modulePath}:\n` +
            `  ESM import error: ${errorMessage}\n` +
            `  CJS fallback error: ${cjsErrorMessage}\n` +
            `To fix this, either:\n` +
            `  1. Rename the file to .cjs (recommended for CommonJS)\n` +
            `  2. Convert to ESM syntax (import/export)\n` +
            `  3. Ensure the file has valid JavaScript syntax`,
        );

        // biome-ignore lint/suspicious/noExplicitAny: FIXME: this is broken
        (combinedError as any).cause = { esmError: err, cjsError: cjsErr };
        throw combinedError;
      }
    }

    // Log stack trace for debugging
    const e = err as Error;
    if (e.stack) {
      logger.debug(e.stack);
    }

    // Normalize ERR_MODULE_NOT_FOUND to ENOENT when the file itself doesn't exist
    // (vs a dependency inside the file being missing).
    // This provides clearer error messages for users when their files don't exist.
    const nodeError = err as NodeJS.ErrnoException;
    if (nodeError.code === 'ERR_MODULE_NOT_FOUND') {
      const resolvedModulePath = safeResolve(modulePath);
      try {
        await fsPromises.access(resolvedModulePath);
        // File exists - the error is about a missing dependency, log and preserve original error
        logger.error(`ESM import failed: ${err}`);
      } catch {
        // File doesn't exist - normalize to ENOENT for clearer error message
        // Don't log as error - this is expected during config file discovery
        const enoentError = new Error(
          `ENOENT: no such file or directory, open '${resolvedModulePath}'`,
        ) as NodeJS.ErrnoException;
        enoentError.code = 'ENOENT';
        enoentError.path = resolvedModulePath;
        throw enoentError;
      }
    } else {
      // For all other errors (not file-not-found), log as error
      logger.error(`ESM import failed: ${err}`);
    }

    throw err;
  }
}

/**
 * Detects if an error message indicates a CommonJS module being loaded in ESM context.
 */
export function isCjsInEsmError(message: string): boolean {
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
 * Loads a CommonJS module by executing it in a vm context with proper CJS globals.
 * This bypasses Node.js's module type detection which is based on package.json "type" field.
 *
 * SECURITY NOTE: This is NOT a security sandbox. The executed code has full access to
 * the file system, network, etc. via the injected require function and process object.
 * This is intentional - it's designed for loading trusted user configuration files
 * (custom providers, assertions, hooks) that need full Node.js capabilities.
 */

// biome-ignore lint/suspicious/noExplicitAny: This is actually loading a user space module that can be anything
function loadCjsModule(modulePath: string): any {
  const code = fs.readFileSync(modulePath, 'utf-8');
  const dirname = path.dirname(modulePath);
  const filename = modulePath;

  // Create a require function scoped to the module's directory
  const moduleRequire = createRequire(pathToFileURL(modulePath).href);

  // Create module and exports objects
  // biome-ignore lint/suspicious/noExplicitAny: This is actually loading a user space module that can be anything
  const moduleObj: { exports: any } = { exports: {} };

  // Create a context with CJS globals
  // We include all commonly used Node.js globals to ensure compatibility
  const context = vm.createContext({
    // CJS-specific globals
    module: moduleObj,
    exports: moduleObj.exports,
    require: moduleRequire,
    __dirname: dirname,
    __filename: filename,

    // Global object references (some CJS modules use these)
    global: globalThis,
    globalThis,

    // Console and process
    console,
    process,

    // Binary data
    Buffer,

    // Timers
    setTimeout,
    setInterval,
    setImmediate,
    clearTimeout,
    clearInterval,
    clearImmediate,
    queueMicrotask,

    // URL handling
    URL,
    URLSearchParams,

    // Text encoding/decoding
    TextEncoder,
    TextDecoder,
    atob: globalThis.atob,
    btoa: globalThis.btoa,

    // Fetch API (Node 18+)
    fetch: globalThis.fetch,
    Request: globalThis.Request,
    Response: globalThis.Response,
    Headers: globalThis.Headers,

    // Abort handling
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,

    // Events
    Event: globalThis.Event,
    EventTarget: globalThis.EventTarget,

    // Errors
    Error,
    TypeError,
    ReferenceError,
    SyntaxError,
    RangeError,

    // Other built-ins that CJS modules might use
    Array,
    Object,
    String,
    Number,
    Boolean,
    Symbol,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Proxy,
    Reflect,
    JSON,
    Math,
    Date,
    RegExp,
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    DataView,
    ArrayBuffer,
    SharedArrayBuffer: globalThis.SharedArrayBuffer,
    Atomics: globalThis.Atomics,
    BigInt,

    // Functions
    eval: undefined, // Disable eval for safety
    Function,
    isNaN,
    isFinite,
    parseFloat,
    parseInt,
    decodeURI,
    decodeURIComponent,
    encodeURI,
    encodeURIComponent,
  });

  // Execute the code in the context
  vm.runInContext(code, context, { filename: modulePath });

  return moduleObj.exports;
}
