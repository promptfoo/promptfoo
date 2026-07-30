import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { getConfigDirectoryPath } from '../util/config/manage';

const RUNTIME_NOTICE_DIRECTORY = 'notices';
const RUNTIME_NOTICE_LOCK_LEASE_MS = 30_000;

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
 * Run a synchronous state transition while holding an exclusive per-notice lease. A concurrent
 * caller returns undefined instead of duplicating the transition. Each caller reserves the current
 * and following generation so a lease cannot expire at a bucket boundary. Abandoned leases stop
 * contending after a bounded interval without unlinking another process's newly acquired lock.
 *
 * A hard kill (SIGKILL, OOM, power loss) between acquiring and the finally release leaves an
 * orphaned `.lock.<generation>` file. This is intentional and harmless: later callers always use
 * newer generations and never contend with it, so at most one tiny file lingers per hard crash.
 */
export function withRuntimeNoticeStateLock<T>(noticeId: string, callback: () => T): T | undefined {
  const leaseGeneration = Math.floor(Date.now() / RUNTIME_NOTICE_LOCK_LEASE_MS);
  const statePath = getRuntimeNoticeStatePath(noticeId, true);
  const acquiredLocks: { descriptor: number; path: string }[] = [];

  try {
    for (const generation of [leaseGeneration, leaseGeneration + 1]) {
      const lockPath = `${statePath}.lock.${generation}`;
      let lockDescriptor: number;

      try {
        lockDescriptor = fs.openSync(lockPath, 'wx', 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          return undefined;
        }
        throw error;
      }

      acquiredLocks.push({ descriptor: lockDescriptor, path: lockPath });
      fs.writeFileSync(lockDescriptor, `${process.pid}\n`);
    }

    return callback();
  } finally {
    for (const lock of acquiredLocks.reverse()) {
      fs.closeSync(lock.descriptor);
      fs.rmSync(lock.path, { force: true });
    }
  }
}
