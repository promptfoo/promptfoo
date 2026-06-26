import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { getConfigDirectoryPath } from '../util/config/manage';

const RUNTIME_NOTICE_DIRECTORY = 'notices';
const RUNTIME_NOTICE_LOCK_STALE_MS = 30_000;

function getRuntimeNoticeStatePath(noticeId: string, createDirectory: boolean): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(noticeId)) {
    throw new Error(`Invalid runtime notice id: ${noticeId}`);
  }
  const directory = path.join(getConfigDirectoryPath(createDirectory), RUNTIME_NOTICE_DIRECTORY);
  if (createDirectory) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return path.join(directory, `${noticeId}.last-shown`);
}

export function readRuntimeNoticeLastShownAt(noticeId: string): string | undefined {
  try {
    return fs.readFileSync(getRuntimeNoticeStatePath(noticeId, false), 'utf8').trim() || undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export function writeRuntimeNoticeLastShownAt(noticeId: string, lastShownAt: string): void {
  const statePath = getRuntimeNoticeStatePath(noticeId, true);
  const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    fs.writeFileSync(temporaryPath, `${lastShownAt}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, statePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

/**
 * Run a synchronous state transition while holding an exclusive per-notice lock. A concurrent
 * caller returns undefined instead of duplicating the transition. Locks left by terminated
 * processes are reclaimed after a short timeout.
 */
export function withRuntimeNoticeStateLock<T>(noticeId: string, callback: () => T): T | undefined {
  const lockPath = `${getRuntimeNoticeStatePath(noticeId, true)}.lock`;
  let lockDescriptor: number | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      lockDescriptor = fs.openSync(lockPath, 'wx', 0o600);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw error;
      }

      try {
        const lockAgeMs = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (
          lockAgeMs >= -RUNTIME_NOTICE_LOCK_STALE_MS &&
          lockAgeMs <= RUNTIME_NOTICE_LOCK_STALE_MS
        ) {
          return undefined;
        }
        fs.rmSync(lockPath);
      } catch (lockError) {
        if ((lockError as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw lockError;
        }
      }
    }
  }

  if (lockDescriptor === undefined) {
    return undefined;
  }

  try {
    fs.writeFileSync(lockDescriptor, `${process.pid}\n`);
    return callback();
  } finally {
    fs.closeSync(lockDescriptor);
    fs.rmSync(lockPath, { force: true });
  }
}
