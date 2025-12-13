/**
 * Browser-safe process shim module.
 *
 * This module provides a shimmed process object that works in both Node.js and browser
 * environments. In Node.js, it provides full functionality including process.mainModule.require.
 * In browsers, it returns a minimal shim that throws helpful errors when Node.js-specific
 * features are accessed.
 *
 * This separation is necessary because:
 * 1. The promptfoo webui imports httpTransforms.ts which needs getProcessShim()
 * 2. httpTransforms.ts is designed to be frontend-importable for testing transforms in the UI
 * 3. The Node.js implementation uses createRequire from 'node:module' which doesn't exist in browsers
 *
 * By using runtime environment detection and dynamic imports, we can:
 * - Avoid top-level imports of Node.js-only modules that would break browser bundling
 * - Provide appropriate functionality for each environment
 */

/**
 * Detects if the current environment is a browser or web worker.
 * Handles test environments (jsdom/happy-dom) that define window in Node.js.
 */
function isBrowserEnvironment(): boolean {
  // Check for Node.js first - handles test environments with jsdom/happy-dom
  const isNode =
    typeof process !== 'undefined' &&
    typeof (process as unknown as { versions?: { node?: string } }).versions?.node === 'string';
  if (isNode) {
    return false;
  }

  return (
    typeof window !== 'undefined' ||
    (typeof self !== 'undefined' &&
      typeof (self as unknown as { importScripts?: unknown }).importScripts === 'function')
  );
}

/**
 * Creates a minimal process shim for browser environments.
 * This shim provides helpful error messages when Node.js-specific features are accessed.
 */
function createBrowserProcessShim(): typeof process {
  return {
    env: {},
    mainModule: {
      require: () => {
        throw new Error(
          'require() is not available in browser transforms. Use standard JavaScript instead.',
        );
      },
      exports: {},
      id: '.',
      filename: '',
      loaded: true,
      children: [],
      paths: [],
    },
  } as unknown as typeof process;
}

// Cached Node.js process shim to avoid repeated setup
let cachedNodeProcessShim: typeof process | null = null;

/**
 * Returns a shimmed process object that works in both Node.js and browser environments.
 *
 * In Node.js:
 * - Returns a proxy with process.mainModule.require shimmed for ESM compatibility
 * - Allows inline transforms to use require() even in ESM context
 *
 * In browsers:
 * - Returns a minimal shim with helpful error messages
 * - Allows simple transforms that don't use require() to work
 *
 * @example
 * // In Node.js - can use require
 * const fn = new Function('data', 'process', `return process.mainModule.require('fs')`);
 * fn(data, getProcessShim());
 *
 * @example
 * // In browser - simple transforms work
 * const fn = new Function('data', 'process', `return data.toUpperCase()`);
 * fn(data, getProcessShim());
 */
export function getProcessShim(): typeof process {
  if (isBrowserEnvironment()) {
    return createBrowserProcessShim();
  }

  // Node.js environment - create shim with working require
  if (!cachedNodeProcessShim) {
    try {
      // Dynamic require of node:module - this is NOT a top-level import so bundlers
      // won't try to resolve it. It only executes at runtime in Node.js.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeModule = require('node:module') as typeof import('node:module');
      const esmRequire = nodeModule.createRequire(import.meta.url);

      cachedNodeProcessShim = new Proxy(process, {
        get(target, prop) {
          if (prop === 'mainModule') {
            return {
              require: esmRequire,
              exports: {},
              id: '.',
              filename: '',
              loaded: true,
              children: [],
              paths: [],
            };
          }
          return Reflect.get(target, prop);
        },
      });
    } catch {
      // If createRequire fails for any reason, return browser shim as fallback
      return createBrowserProcessShim();
    }
  }
  return cachedNodeProcessShim;
}

// Export for testing purposes
export { isBrowserEnvironment as _isBrowserEnvironment };
export { createBrowserProcessShim as _createBrowserProcessShim };
