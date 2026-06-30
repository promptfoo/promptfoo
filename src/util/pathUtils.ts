/**
 * Path resolution utilities that work with both regular paths and file:// URLs
 */
import { fileURLToPath } from 'node:url';
import * as fs from 'fs';
import path from 'path';

import { escape as escapeGlob, globSync, hasMagic } from 'glob';

export const GLOB_OPTIONS = {
  magicalBraces: true,
  nodir: true,
  windowsPathsNoEscape: process.platform === 'win32',
} as const;

export function escapeExistingDirectoryPrefix(pattern: string): string {
  const { root } = path.parse(pattern);
  const parts = pattern.slice(root.length).split(path.sep).filter(Boolean);
  let literalPrefix = root;
  let consumedParts = 0;

  for (const part of parts) {
    const candidate = path.join(literalPrefix, part);
    if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) {
      break;
    }
    literalPrefix = candidate;
    consumedParts++;
  }

  if (consumedParts === 0) {
    return pattern;
  }
  return path.join(escapeGlob(literalPrefix, GLOB_OPTIONS), ...parts.slice(consumedParts));
}

/** Return an exact existing file before interpreting its name as glob syntax. */
export function resolveLiteralPathOrGlob(pattern: string): string[] {
  if (fs.statSync(pattern, { throwIfNoEntry: false })?.isFile()) {
    return [pattern];
  }
  const globPattern = hasMagic(pattern, GLOB_OPTIONS)
    ? escapeExistingDirectoryPrefix(pattern)
    : pattern;
  return globSync(globPattern, GLOB_OPTIONS);
}

/**
 * Check if a file path is absolute, handling both regular paths and URLs
 * @param filePath - The file path to check
 * @returns True if the path is absolute
 */
function isAbsolute(filePath: string): boolean {
  if (!filePath) {
    return false;
  }

  // Treat any URL scheme as absolute to avoid mangling URLs in join/resolve
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(filePath)) {
    if (filePath.startsWith('file://')) {
      try {
        return path.isAbsolute(fileURLToPath(filePath));
      } catch {
        // Handle non-standard but common variants like file://C:/...
        return true;
      }
    }
    return true; // e.g., http(s)://, data://, etc.
  }

  return path.isAbsolute(filePath);
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
