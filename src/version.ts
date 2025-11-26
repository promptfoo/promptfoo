/**
 * Version and build-time constants.
 *
 * This module uses compile-time injection:
 * - At build time (tsup): Constants are injected via `define` and inlined
 * - In development/test: Fallback defaults are used
 *
 * Note: The frontend app (src/app) uses its own version mechanism via
 * import.meta.env.VITE_PROMPTFOO_VERSION defined in vite.config.ts
 */

// Build-time constants injected by tsup's `define` option.
// In development/test environments, these remain undefined.
declare const __PROMPTFOO_VERSION__: string | undefined;
declare const __PROMPTFOO_POSTHOG_KEY__: string | undefined;
declare const __PROMPTFOO_ENGINES_NODE__: string | undefined;

/**
 * Application version from package.json.
 * Injected at build time. Falls back to development version otherwise.
 */
export const VERSION: string =
  typeof __PROMPTFOO_VERSION__ !== 'undefined' ? __PROMPTFOO_VERSION__ : '0.0.0-development';

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
  node: typeof __PROMPTFOO_ENGINES_NODE__ !== 'undefined' ? __PROMPTFOO_ENGINES_NODE__ : '>=20.0.0',
} as const;
