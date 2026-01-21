/**
 * Version and build-time constants.
 *
 * This module uses compile-time injection:
 * - At build time (tsdown): Constants are injected via `define` and inlined
 * - In development (npm scripts): Uses npm_package_* environment variables
 * - In browser builds: Falls back to defaults (frontend uses VITE_PROMPTFOO_VERSION)
 */

// Build-time constants injected by tsdown's `define` option.
// In development/test environments, these remain undefined.
//
// Note: __PROMPTFOO_MIN_NODE_VERSION__ is also injected at build time,
// but is declared in entrypoint.ts to maintain its zero-dependency isolation.
// The entrypoint must check Node version before importing any modules.
declare const __PROMPTFOO_VERSION__: string | undefined;
declare const __PROMPTFOO_POSTHOG_KEY__: string | undefined;

/**
 * Application version from package.json.
 * Injected at build time, or read from npm environment in development.
 */
export const VERSION: string =
  typeof __PROMPTFOO_VERSION__ !== 'undefined'
    ? __PROMPTFOO_VERSION__
    : (process.env.npm_package_version ?? '0.0.0-development');

/**
 * PostHog analytics key.
 * Only populated during production builds via PROMPTFOO_POSTHOG_KEY env var.
 * Empty string in development/test.
 */
export const POSTHOG_KEY: string =
  typeof __PROMPTFOO_POSTHOG_KEY__ !== 'undefined' ? __PROMPTFOO_POSTHOG_KEY__ : '';
