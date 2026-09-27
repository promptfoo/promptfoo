import fs from 'fs';
import path from 'path';

import { getProcessEnv } from '../../envars';

const MINIMAL_CLI_ENV_KEYS = [
  'PATH',
  'Path',
  'HOME',
  'USER',
  'USERNAME',
  'USERPROFILE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SHELL',
  'COMSPEC',
  'SystemRoot',
  'PATHEXT',
  'LANG',
  'LC_ALL',
  'TERM',
] as const;

export const COMMON_OPTIONAL_PROCESS_ENV_KEYS = [
  'CODEX_HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'NODE_EXTRA_CA_CERTS',
  'SSH_AUTH_SOCK',
  'GIT_SSH_COMMAND',
] as const;

export function getMinimalProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const processEnv = getProcessEnv();
  for (const key of MINIMAL_CLI_ENV_KEYS) {
    const value = processEnv[key];
    if (typeof value === 'string' && value.length > 0) {
      env[key] = value;
    }
  }
  return env;
}

export function findGitRepositoryRoot(workingDir: string): string | undefined {
  let currentDir = path.resolve(workingDir);

  while (true) {
    if (fs.existsSync(path.join(currentDir, '.git'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

export async function runSerializedThreadTurn<T>(
  threadRunQueues: Map<string, Promise<void>>,
  queueKey: string | undefined,
  abortSignal: AbortSignal | undefined,
  executeTurn: () => Promise<T>,
  createAbortError: () => Error,
): Promise<T> {
  if (!queueKey) {
    return executeTurn();
  }

  const previousRun = threadRunQueues.get(queueKey) ?? Promise.resolve();
  let releaseCurrentRun: () => void = () => {};
  const currentRun = new Promise<void>((resolve) => {
    releaseCurrentRun = resolve;
  });
  const queuedRun = previousRun.catch(() => undefined).then(() => currentRun);
  threadRunQueues.set(queueKey, queuedRun);
  void queuedRun.finally(() => {
    if (threadRunQueues.get(queueKey) === queuedRun) {
      threadRunQueues.delete(queueKey);
    }
  });

  try {
    await waitForPreviousThreadRun(previousRun, abortSignal, createAbortError);
    return await executeTurn();
  } finally {
    releaseCurrentRun();
  }
}

export async function waitForPreviousThreadRun(
  previousRun: Promise<void>,
  abortSignal: AbortSignal | undefined,
  createAbortError: () => Error,
): Promise<void> {
  const previousRunDone = previousRun.catch(() => undefined);
  if (!abortSignal) {
    await previousRunDone;
    return;
  }
  if (abortSignal.aborted) {
    throw createAbortError();
  }

  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<void>((_, reject) => {
    onAbort = () => reject(createAbortError());
    abortSignal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    await Promise.race([previousRunDone, abortPromise]);
  } finally {
    if (onAbort) {
      abortSignal.removeEventListener('abort', onAbort);
    }
  }
}
