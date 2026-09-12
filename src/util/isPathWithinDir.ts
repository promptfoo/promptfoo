/**
 * Symlink-safe directory containment check.
 *
 * Resolves symlinks via realpath to prevent symlink-based directory
 * traversal attacks. For non-existent paths (e.g., when creating new
 * files), recursively validates the parent directory.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import logger from '../logger';

/**
 * Check if a file path is within a given directory.
 *
 * @param filePath - The file path to check (can be relative or absolute)
 * @param dir - The containing directory (absolute path)
 * @returns Promise that resolves to true if the path is within dir
 */
export async function isPathWithinDir(filePath: string, dir: string): Promise<boolean> {
  const target = path.isAbsolute(filePath) ? filePath : path.resolve(dir, filePath);
  return isPathWithinCanonicalDir(target, await resolveCanonicalDir(dir));
}

/** Resolve a directory once when callers need to keep its identity stable. */
export async function resolveCanonicalDir(dir: string): Promise<string> {
  try {
    return await fs.realpath(dir);
  } catch {
    throw new Error(`Directory does not exist or is inaccessible: ${dir}`);
  }
}

/**
 * Check against an already-resolved directory without resolving that directory again.
 * This keeps case-sensitive Windows directories distinct and lets callers pin the
 * allowed directory across multiple filesystem operations.
 */
export async function isPathWithinCanonicalDir(
  filePath: string,
  realDir: string,
): Promise<boolean> {
  try {
    const absoluteTarget = path.isAbsolute(filePath) ? filePath : path.resolve(realDir, filePath);
    const realTargetRaw = await fs.realpath(absoluteTarget);
    return isCanonicalPathWithinDir(realTargetRaw, realDir);
  } catch (error: any) {
    // If target doesn't exist (ENOENT), validate parent directory instead.
    // This allows writes to create new files in valid directories.
    if (error.code === 'ENOENT') {
      const absoluteTarget = path.isAbsolute(filePath) ? filePath : path.resolve(realDir, filePath);
      const parentDir = path.dirname(absoluteTarget);

      // Stop recursion if we've reached root
      if (parentDir === absoluteTarget) {
        logger.warn('Path validation failed — reached filesystem root');
        return false;
      }

      return isPathWithinCanonicalDir(parentDir, realDir);
    }

    // Fail safely on any other error (broken symlinks, permission errors, etc.)
    logger.warn(`Path validation failed for ${filePath}: ${error.message ?? error}`);
    return false;
  }
}

/** Check two already-resolved paths without another filesystem lookup. */
export function isCanonicalPathWithinDir(realTarget: string, realDir: string): boolean {
  const prefix = realDir.endsWith(path.sep) ? realDir : `${realDir}${path.sep}`;
  return realTarget === realDir || realTarget.startsWith(prefix);
}
