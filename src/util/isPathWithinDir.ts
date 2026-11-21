/**
 * Resolve symlinks before checking directory containment. For paths that do not
 * exist yet, check their parent directory. The filesystem must remain trusted
 * between this check and the caller's file operation.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import logger from '../logger';

/** Compare realpath results without folding the case of distinct Windows directories. */
export function isCanonicalPathWithinDir(filePath: string, dir: string): boolean {
  const prefix = dir.endsWith(path.sep) ? dir : dir + path.sep;
  return filePath === dir || filePath.startsWith(prefix);
}

/**
 * Check if a file path is within a given directory.
 *
 * @param filePath - The file path to check (can be relative or absolute)
 * @param dir - The containing directory (absolute path)
 * @returns Promise that resolves to true if the path is within dir
 */
export async function isPathWithinDir(filePath: string, dir: string): Promise<boolean> {
  // Validate dir exists first — fail fast on configuration errors
  let realDir: string;
  try {
    realDir = await fs.realpath(dir);
  } catch {
    throw new Error(`Directory does not exist or is inaccessible: ${dir}`);
  }

  let target = path.isAbsolute(filePath) ? filePath : path.resolve(dir, filePath);
  while (true) {
    try {
      return isCanonicalPathWithinDir(await fs.realpath(target), realDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`Path validation failed for ${filePath}: ${error}`);
        return false;
      }
    }
    // A missing entry can be created in a safe directory. A dangling symlink
    // also yields ENOENT from realpath, but writing through it follows its target.
    const missing = await fs.lstat(target).then(
      () => false,
      (error: NodeJS.ErrnoException) => error.code === 'ENOENT',
    );
    const parent = path.dirname(target);
    if (!missing || parent === target) {
      return false;
    }
    target = parent;
  }
}
