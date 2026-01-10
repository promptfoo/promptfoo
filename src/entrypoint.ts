/**
 * Entry point for the promptfoo CLI.
 *
 * This file intentionally has NO dependencies to ensure the Node.js version
 * check runs before any module loading that might fail on older versions.
 *
 * Some dependencies (like string-width via ora) use ES2024 features (e.g., RegExp /v flag)
 * that cause cryptic syntax errors on Node.js < 20. By checking the version first,
 * we can provide a helpful error message instead.
 */
import { fileURLToPath } from 'node:url';

// Build-time constant injected by tsdown from package.json engines field
declare const __PROMPTFOO_MIN_NODE_VERSION__: number | undefined;

// Use injected value at build time, fallback to 20 for development/testing
const minNodeVersion =
  typeof __PROMPTFOO_MIN_NODE_VERSION__ !== 'undefined' ? __PROMPTFOO_MIN_NODE_VERSION__ : 20;

// Skip version check for alternative runtimes (Bun, Deno) - they support modern JS features
const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
const isDeno = typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';

if (!isBun && !isDeno) {
  // process.version is always "vX.Y.Z" (e.g., "v20.0.0"), so slice(1) gives "20.0.0"
  const major = parseInt(process.version.slice(1), 10);
  // NaN check handles malformed version strings - fail safely rather than allowing through
  if (Number.isNaN(major)) {
    console.error(
      `\x1b[33mUnexpected Node.js version format: ${process.version}. Please use Node.js ${minNodeVersion} or later.\x1b[0m`,
    );
    process.exit(1);
  }
  if (major < minNodeVersion) {
    console.error(
      `\x1b[33mNode.js ${process.version} is not supported. Please upgrade to Node.js ${minNodeVersion} or later.\x1b[0m`,
    );
    process.exit(1);
  }
}

// Update argv[1] so isMainModule() in main.ts correctly detects CLI execution.
// Trade-off: This permanently changes argv[1] for the process lifetime.
// Any code reading argv[1] will see the synthetic main.js path, not entrypoint.js.
process.argv[1] = fileURLToPath(new URL('./main.js', import.meta.url));
await import('./main.js');

// Required for top-level await - makes this file an ES module
export {};
