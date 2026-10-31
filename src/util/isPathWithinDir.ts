import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import logger from '../logger';

/**
 * Check whether a path resolves inside dir. For a new file, validate its nearest
 * existing ancestor. A dangling symlink counts as an existing entry and is rejected.
 */
export async function isPathWithinDir(filePath: string, dir: string): Promise<boolean> {
  let realDir: string;
  try {
    realDir = await fs.realpath(dir);
  } catch {
    throw new Error(`Directory does not exist or is inaccessible: ${dir}`);
  }

  // Keep '..' intact so the filesystem resolves it after any preceding symlink.
  let target = path.isAbsolute(filePath)
    ? filePath
    : path.format({ root: path.parse(realDir).root, dir: realDir, base: filePath });
  try {
    for (;;) {
      const parts = path.parse(target);
      // lstat follows the last link when the name ends in a separator.
      target = path.format(parts);
      const entry = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        return undefined;
      });
      if (entry) {
        const relative = path.relative(realDir, await fs.realpath(target));
        return (
          relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
        );
      }
      if (!parts.base || parts.base === '..') {
        return false;
      }
      target = parts.dir;
    }
  } catch (error) {
    logger.warn('Path validation failed', { filePath, error });
    return false;
  }
}
