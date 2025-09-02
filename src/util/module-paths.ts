import path, { dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

/**
 * Cross-compatible helper to get import.meta.url equivalent
 * Works in both ESM and CJS environments
 *
 * Note: In ESM, pass import.meta.url directly to getDirname() instead
 */
export function getImportMetaUrl(): string {
  // In CJS: derive from __filename
  // @ts-ignore - __filename exists in CJS
  if (typeof __filename !== 'undefined') {
    // @ts-ignore
    return pathToFileURL(__filename).href;
  }

  // Fallback (shouldn't normally happen)
  return '';
}

/**
 * Cross-compatible helper to get directory name
 * Works in both ESM and CJS environments
 */
export function getDirname(importMetaUrl?: string): string {
  const url = importMetaUrl || getImportMetaUrl();

  if (url) {
    try {
      // ESM approach
      return dirname(fileURLToPath(url));
    } catch {
      // Fall through to CJS
    }
  }

  // CJS fallback
  // @ts-ignore - __dirname exists in CJS
  if (typeof __dirname !== 'undefined') {
    // @ts-ignore
    return __dirname;
  }

  // Final fallback
  return process.cwd();
}

/**
 * Cross-compatible helper to check if module is being run directly
 * Works in both ESM and CJS environments
 *
 * In bundled contexts, this only returns true for the actual main entry point,
 * not for bundled modules that would normally be main modules when run separately.
 */
export function isMainModule(importMetaUrl?: string): boolean {
  // Check if we're in the CLI bundle - if so, be more restrictive
  if ((global as any).__PROMPTFOO_CLI_BUNDLE__) {
    // In the bundled CLI, only allow main module behavior from the actual main.ts code
    const stack = new Error().stack;
    if (stack) {
      const stackLines = stack.split('\n');

      // Check if this call is coming from strategy files or other modules that shouldn't run as main
      const isFromRestrictedModule = stackLines.some(
        (line) =>
          line.includes('simpleVideo') ||
          line.includes('simpleImage') ||
          line.includes('strategies/') ||
          line.includes('migrate') ||
          // Check for function names that come from strategies
          line.includes('main(') ||
          line.includes('main ') ||
          // Look for patterns in bundled code
          (line.includes('Object.<anonymous>') &&
            (line.includes('simpleVideo') ||
              line.includes('simpleImage') ||
              line.includes('migrate'))),
      );

      // If this is from a restricted module, always return false
      if (isFromRestrictedModule) {
        return false;
      }

      // Additional check: if we see the main CLI logic in the stack, allow it
      const isFromMainCLI = stackLines.some(
        (line) =>
          line.includes('main3(') || // The bundled main function
          line.includes('checkNodeVersion') ||
          line.includes('addCommonOptionsRecursively'),
      );

      if (isFromMainCLI) {
        return true;
      }
    }

    // In bundled context, fall back to CJS detection if stack-based detection fails
    // Don't return false immediately - let it fall through to CJS logic below
  }

  const url = importMetaUrl || getImportMetaUrl();

  if (url && process.argv[1]) {
    try {
      // ESM approach
      const currentFile = fileURLToPath(url);
      const mainFile = path.resolve(process.argv[1]);

      // In bundled contexts, only the main bundle file should be considered main
      if (currentFile === mainFile) {
        return true;
      }

      // For bundled code, check if the main file is a bundle and current is original main
      if (mainFile.includes('main.cjs') || mainFile.includes('main.js')) {
        return (
          currentFile.includes('main.ts') ||
          currentFile.includes('main.js') ||
          currentFile.includes('main.cjs')
        );
      }

      return false;
    } catch {
      // Fall through to CJS
    }
  }

  // CJS fallback - in bundled contexts, be more restrictive
  try {
    // @ts-ignore - require.main exists in CJS
    if (typeof require !== 'undefined' && require.main === module) {
      // Additional check: ensure this isn't a strategy file being executed in bundle
      const filename = require.main?.filename || '';
      if (filename.includes('main.cjs') || filename.includes('main.js')) {
        // We're in the main bundle, so only allow main module behavior for actual main logic
        const stack = new Error().stack;
        if (
          stack &&
          (stack.includes('simpleVideo') ||
            stack.includes('simpleImage') ||
            stack.includes('strategies/'))
        ) {
          return false;
        }
        return true;
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
