import path, { dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

/**
 * Cross-compatible helper to get import.meta.url equivalent
 * Works in both ESM and CJS environments
 */
export function getImportMetaUrl(): string {
  try {
    // In ESM: import.meta.url is available
    if (typeof globalThis !== 'undefined' && 'import' in globalThis) {
      // Use eval to avoid syntax error during build time
      const importMeta = eval('import.meta');
      if (importMeta?.url) {
        return importMeta.url;
      }
    }
  } catch {
    // Fall through to CJS approach
  }

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
 */
export function isMainModule(importMetaUrl?: string): boolean {
  const url = importMetaUrl || getImportMetaUrl();

  if (url && process.argv[1]) {
    try {
      // ESM approach
      return fileURLToPath(url) === path.resolve(process.argv[1]);
    } catch {
      // Fall through to CJS
    }
  }

  // CJS fallback
  try {
    // @ts-ignore - require.main exists in CJS
    return typeof require !== 'undefined' && require.main === module;
  } catch {
    return false;
  }
}
