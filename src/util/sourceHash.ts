import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { getRuntimeEnv } from '../envOverrides';

function hashFiles(files: string[], identity: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(identity));
  const buffer = Buffer.allocUnsafe(64 * 1024);
  for (const file of files) {
    const descriptor = fs.openSync(file, 'r');
    try {
      if (!fs.fstatSync(descriptor).isFile()) {
        throw new Error('Source must be a regular file');
      }
      const fileHash = createHash('sha256');
      let bytesRead: number;
      while ((bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
        fileHash.update(buffer.subarray(0, bytesRead));
      }
      hash.update(JSON.stringify([file, fileHash.digest('hex')]));
    } finally {
      fs.closeSync(descriptor);
    }
  }
  return hash.digest('hex');
}

/** Hash current implementation bytes, including its resolved path and entry point. */
export function getFileSourceHash(filePath: string, functionName?: string | null): string {
  try {
    return hashFiles([path.resolve(filePath)], functionName ?? null);
  } catch {
    // Unreadable source cannot establish a stable replay identity.
    return randomUUID();
  }
}

/** Include the resolved executable and file arguments in an executable's identity. */
export function getExecutableSourceHash(parts: string[], basePath?: string): string {
  const cwd = path.resolve(basePath || '.');
  const command = parts[0];
  const searchPath = command && !/[\\/]/.test(command);
  const processEnv = getRuntimeEnv();
  const suffixes =
    process.platform === 'win32'
      ? ['', ...(processEnv.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')]
      : [''];
  const candidates = searchPath
    ? (processEnv.PATH || '')
        .split(path.delimiter)
        .flatMap((directory) =>
          suffixes.map((suffix) => path.resolve(cwd, directory, command + suffix)),
        )
    : [path.resolve(cwd, command || '')];
  try {
    const executable = candidates.find((candidate) => {
      try {
        if (!fs.statSync(candidate).isFile()) {
          return false;
        }
        if (searchPath) {
          fs.accessSync(candidate, fs.constants.X_OK);
        }
        return true;
      } catch {
        return false;
      }
    });
    if (!executable) {
      return randomUUID();
    }
    const files = [executable];
    for (const argument of parts.slice(1)) {
      const candidate = path.resolve(cwd, argument);
      try {
        if (fs.statSync(candidate).isFile()) {
          files.push(candidate);
        }
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) {
          throw error;
        }
      }
    }
    return hashFiles(files, parts);
  } catch {
    return randomUUID();
  }
}
