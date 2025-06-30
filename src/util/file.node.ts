/**
 * Node-only file utilities.
 * Application tests were failing when trying to import this module possibly
 * because of an older version of polyfilled of node:url.
 *
 * TODO:vedant Fix this hack one day
 */
import { fileURLToPath } from 'node:url';
import path from 'path';

function isAbsolute(filePath: string): boolean {
  try {
    // Handle both Windows and POSIX file URL formats
    // Windows: file://C:/path or file:///C:/path
    // POSIX: file:///path
    if (filePath.startsWith('file://')) {
      return path.isAbsolute(fileURLToPath(filePath));
    }
    return path.isAbsolute(filePath);
  } catch {
    return false;
  }
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
