import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { getConfigDirectoryPath } from '../util/config/manage';

const RUNTIME_NOTICE_DIRECTORY = 'notices';

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
