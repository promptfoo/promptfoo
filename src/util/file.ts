import path from 'path';
import { fileURLToPath } from 'url';

function isAbsolute(filePath: string): boolean {
  try {
    // Handle both Windows and POSIX file URL formats
    // Windows: file://C:/path or file:///C:/path
    // POSIX: file:///path
    if (filePath.startsWith('file://')) {
      fileURLToPath(filePath); // Validate it's a proper file URL
      return true;
    }
    return path.isAbsolute(filePath);
  } catch {
    return false;
  }
}

/**
 * Checks if a file is a JavaScript or TypeScript file based on its extension.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has a JavaScript or TypeScript extension, false otherwise.
 */
export function isJavascriptFile(filePath: string): boolean {
  return /\.(js|cjs|mjs|ts|cts|mts)$/.test(filePath);
}

/**
 * Safely resolves a path - only calls resolve() if the last path is relative
 * Leaves absolute paths and absolute URLs unchanged
 *
 * @param paths - The path segments to resolve
 * @returns The resolved path if last path is relative, or the last path if it's absolute
 */
export function safeResolve(...paths: string[]): string {
  const lastPath = paths[paths.length - 1] || '';
  if (isAbsolute(lastPath)) {
    return lastPath;
  }
  return path.resolve(...paths);
}

/**
 * Safely joins paths - only joins if the last path is relative
 * If the last path is absolute or an absolute URL, returns it directly
 *
 * @param paths - The path segments to join
 * @returns The joined path if last path is relative, or the last path if it's absolute
 */
export function safeJoin(...paths: string[]): string {
  const lastPath = paths[paths.length - 1] || '';
  if (isAbsolute(lastPath)) {
    return lastPath;
  }
  return path.join(...paths);
}
