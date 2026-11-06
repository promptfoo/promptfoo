import { lstatSync, readlinkSync, realpathSync } from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

function isFileNotFoundError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function resolveDanglingSymlinkTarget(outputPath: string, symlinkTarget: string): string {
  return path.resolve(path.dirname(outputPath), symlinkTarget);
}

export async function resolveJsonlOutputPath(outputPath: string): Promise<string> {
  try {
    const stats = await fsPromises.lstat(outputPath);
    if (!stats.isSymbolicLink()) {
      return outputPath;
    }

    try {
      return await fsPromises.realpath(outputPath);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return resolveDanglingSymlinkTarget(outputPath, await fsPromises.readlink(outputPath));
      }
      throw error;
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return outputPath;
    }
    throw error;
  }
}

export function resolveJsonlOutputPathSync(outputPath: string): string {
  try {
    const stats = lstatSync(outputPath);
    if (!stats.isSymbolicLink()) {
      return outputPath;
    }

    try {
      return realpathSync(outputPath);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return resolveDanglingSymlinkTarget(outputPath, readlinkSync(outputPath));
      }
      throw error;
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return outputPath;
    }
    throw error;
  }
}
