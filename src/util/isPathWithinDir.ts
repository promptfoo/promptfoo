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
  // Validate dir exists first — fail fast on configuration errors
  let realDirRaw: string;
  try {
    realDirRaw = await fs.realpath(dir);
  } catch {
    throw new Error(`Directory does not exist or is inaccessible: ${dir}`);
  }

  try {
    const absoluteTarget = path.isAbsolute(filePath) ? filePath : path.resolve(dir, filePath);
    const realTargetRaw = await fs.realpath(absoluteTarget);

    // Windows: compare case-insensitive
    const realDir = process.platform === 'win32' ? realDirRaw.toLowerCase() : realDirRaw;
    const realTarget = process.platform === 'win32' ? realTargetRaw.toLowerCase() : realTargetRaw;

    // Equal means the dir itself
    if (realTarget === realDir) {
      return true;
    }

    // Containment check via relative() — avoids prefix gotchas like /foo/bar vs /foo/barista
    const rel = path.relative(realDir, realTarget);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch (error: any) {
    // If target doesn't exist (ENOENT), validate parent directory instead.
    // This allows writes to create new files in valid directories.
    if (error.code === 'ENOENT') {
      const absoluteTarget = path.isAbsolute(filePath) ? filePath : path.resolve(dir, filePath);
      const parentDir = path.dirname(absoluteTarget);

      // Stop recursion if we've reached root
      if (parentDir === absoluteTarget) {
        logger.warn('Path validation failed — reached filesystem root');
        return false;
      }

      return isPathWithinDir(parentDir, dir);
    }

    // Fail safely on any other error (broken symlinks, permission errors, etc.)
    logger.warn(`Path validation failed for ${filePath}: ${error.message ?? error}`);
    return false;
  }
}
