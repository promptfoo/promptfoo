import { lstatSync, readlinkSync, realpathSync } from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

const MAX_SYMLINK_HOPS = 40;

function isFileNotFoundError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function resolveSymlinkTargetPath(symlinkPath: string, symlinkTarget: string): string {
  return path.resolve(path.dirname(symlinkPath), symlinkTarget);
}

function tooManySymlinksError(outputPath: string): NodeJS.ErrnoException {
  const error = new Error(
    `ELOOP: too many symbolic links encountered, realpath '${outputPath}'`,
  ) as NodeJS.ErrnoException;
  error.code = 'ELOOP';
  error.path = outputPath;
  error.syscall = 'realpath';
  return error;
}

async function resolveDanglingSymlinkTarget(
  outputPath: string,
  symlinkTarget: string,
): Promise<string> {
  let targetPath = resolveSymlinkTargetPath(outputPath, symlinkTarget);

  for (let hop = 0; hop < MAX_SYMLINK_HOPS; hop++) {
    let stats;
    try {
      stats = await fsPromises.lstat(targetPath);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return targetPath;
      }
      throw error;
    }

    if (!stats.isSymbolicLink()) {
      return targetPath;
    }

    try {
      return await fsPromises.realpath(targetPath);
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
      targetPath = resolveSymlinkTargetPath(targetPath, await fsPromises.readlink(targetPath));
    }
  }
  throw tooManySymlinksError(outputPath);
}

function resolveDanglingSymlinkTargetSync(outputPath: string, symlinkTarget: string): string {
  let targetPath = resolveSymlinkTargetPath(outputPath, symlinkTarget);

  for (let hop = 0; hop < MAX_SYMLINK_HOPS; hop++) {
    let stats;
    try {
      stats = lstatSync(targetPath);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return targetPath;
      }
      throw error;
    }

    if (!stats.isSymbolicLink()) {
      return targetPath;
    }

    try {
      return realpathSync(targetPath);
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
      targetPath = resolveSymlinkTargetPath(targetPath, readlinkSync(targetPath));
    }
  }
  throw tooManySymlinksError(outputPath);
}

export async function resolveJsonlOutputPath(outputPath: string): Promise<string> {
  let stats;
  try {
    stats = await fsPromises.lstat(outputPath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return outputPath;
    }
    throw error;
  }

  if (!stats.isSymbolicLink()) {
    return outputPath;
  }

  try {
    return await fsPromises.realpath(outputPath);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
    return resolveDanglingSymlinkTarget(outputPath, await fsPromises.readlink(outputPath));
  }
}

export function resolveJsonlOutputPathSync(outputPath: string): string {
  let stats;
  try {
    stats = lstatSync(outputPath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return outputPath;
    }
    throw error;
  }

  if (!stats.isSymbolicLink()) {
    return outputPath;
  }

  try {
    return realpathSync(outputPath);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
    return resolveDanglingSymlinkTargetSync(outputPath, readlinkSync(outputPath));
  }
}
