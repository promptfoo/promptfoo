/**
 * Version and build-time constants.
 *
 * This module uses compile-time injection:
 * - At build time (tsdown): Constants are injected via `define` and inlined
 * - In development/test (Node.js): Reads from package.json at runtime
 * - In browser builds: Falls back to defaults (frontend has its own mechanism)
 *
 * Note: The frontend app (src/app) uses its own version mechanism via
 * import.meta.env.VITE_PROMPTFOO_VERSION defined in vite.config.ts
 */

import { createRequire } from 'node:module';

// Build-time constants injected by tsdown's `define` option.
// In development/test environments, these remain undefined.
declare const __PROMPTFOO_VERSION__: string | undefined;
declare const __PROMPTFOO_POSTHOG_KEY__: string | undefined;
declare const __PROMPTFOO_ENGINES_NODE__: string | undefined;

/**
 * Reads package.json at runtime for Node.js development/test environments.
 * Returns null in browser environments to allow fallback to defaults.
 */
function readPackageJsonSync(): { version: string; engines: { node: string } } | null {
  // Skip in browser environments
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    // In ESM, require is not available. Use createRequire to get a require function.
    const require = createRequire(import.meta.url);
    const fs = require('fs');
    const path = require('path');
    const url = require('url');

    // Get __dirname equivalent in ESM
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

    // Try multiple possible locations for package.json
    const possiblePaths = [
      path.join(__dirname, '../package.json'),
      path.join(__dirname, '../../package.json'),
      path.join(process.cwd(), 'package.json'),
    ];

    for (const pkgPath of possiblePaths) {
      try {
        if (fs.existsSync(pkgPath)) {
          const content = fs.readFileSync(pkgPath, 'utf8');
          const pkg = JSON.parse(content);
          if (pkg.name === 'promptfoo') {
            return pkg;
          }
        }
      } catch {
        // Try next path
      }
    }
  } catch {
    // Node.js APIs not available or failed (e.g., in browser build or pure ESM)
  }

  return null;
}

// Cache the package.json read
let _packageJson: { version: string; engines: { node: string } } | null | undefined;
function getPackageJson(): { version: string; engines: { node: string } } | null {
  if (_packageJson === undefined) {
    _packageJson = readPackageJsonSync();
  }
  return _packageJson;
}

/**
 * Application version from package.json.
 * Injected at build time, read from package.json in dev/test.
 */
export const VERSION: string =
  typeof __PROMPTFOO_VERSION__ !== 'undefined'
    ? __PROMPTFOO_VERSION__
    : (getPackageJson()?.version ?? '0.0.0-development');

/**
 * PostHog analytics key.
 * Only populated during production builds via PROMPTFOO_POSTHOG_KEY env var.
 * Empty string in development/test.
 */
export const POSTHOG_KEY: string =
  typeof __PROMPTFOO_POSTHOG_KEY__ !== 'undefined' ? __PROMPTFOO_POSTHOG_KEY__ : '';

/**
 * Node.js engine requirements from package.json.
 * Used for version checking at startup.
 */
export const ENGINES = {
  node:
    typeof __PROMPTFOO_ENGINES_NODE__ !== 'undefined'
      ? __PROMPTFOO_ENGINES_NODE__
      : (getPackageJson()?.engines.node ?? '>=20.0.0'),
} as const;
