import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '../src/util/createHash';
import { mockProcessEnv, removeTempDir } from './util/utils';

describe('persistent cache claims', () => {
  let cachePath: string;
  let cache: typeof import('../src/cache');

  async function holdClaimLock() {
    await cache.claimBackgroundUsageOnce('initialize');
    const db = new DatabaseSync(path.join(cachePath, 'claims/claims.db'));
    db.exec('BEGIN IMMEDIATE');
    return () => {
      if (db.isOpen) {
        db.close();
      }
    };
  }

  beforeEach(async () => {
    cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cache-claims-'));
    mockProcessEnv({ PROMPTFOO_CACHE_TYPE: 'disk', PROMPTFOO_CACHE_PATH: cachePath });
    vi.resetModules();
    cache = await import('../src/cache');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    removeTempDir(cachePath);
  });

  it('keeps claims after the response TTL without creating per-response files', async () => {
    mockProcessEnv({ PROMPTFOO_CACHE_TTL: '1' });
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = Date.now();
    expect(await cache.claimBackgroundUsageOnce('response')).toBe(true);
    vi.setSystemTime(now + 60_000);
    expect(await cache.claimBackgroundUsageOnce('response')).toBe(false);
    expect(await cache.claimBackgroundUsageOnce('next-response')).toBe(true);
    expect(fs.readdirSync(path.join(cachePath, 'claims'))).toEqual(['claims.db']);
  });

  it('isolates cache paths and namespaces', async () => {
    expect(await cache.claimBackgroundUsageOnce('response')).toBe(true);
    expect(
      await cache.withCacheNamespace('repeat:1', () => cache.claimBackgroundUsageOnce('response')),
    ).toBe(true);
    expect(
      await cache.withCacheNamespace('repeat:1', () => cache.claimBackgroundUsageOnce('response')),
    ).toBe(false);
    mockProcessEnv({ PROMPTFOO_CACHE_PATH: path.join(cachePath, 'other-cache') });
    expect(await cache.claimBackgroundUsageOnce('response')).toBe(true);
  });

  it('preserves legacy markers without creating an index or changing their age', async () => {
    const claimsPath = path.join(cachePath, 'claims');
    const hash = sha256('response');
    fs.mkdirSync(claimsPath);
    fs.writeFileSync(path.join(claimsPath, hash), '');
    fs.utimesSync(path.join(claimsPath, hash), 1, 1);

    expect(await cache.claimBackgroundUsageOnce('response')).toBe(false);
    expect(fs.statSync(path.join(claimsPath, hash)).mtimeMs).toBe(1000);
    expect(fs.readdirSync(claimsPath)).toEqual([hash]);
  });

  it('removes both storage formats only on an explicit cache clear', async () => {
    expect(await cache.claimBackgroundUsageOnce('response')).toBe(true);
    const claimsPath = path.join(cachePath, 'claims');
    fs.writeFileSync(path.join(claimsPath, sha256('legacy')), '');

    await cache.clearCache();

    expect(fs.existsSync(claimsPath)).toBe(false);
    expect(await cache.claimBackgroundUsageOnce('response')).toBe(true);
    expect(await cache.claimBackgroundUsageOnce('legacy')).toBe(true);
  });

  it('does not claim in memory when the durable index cannot be opened', async () => {
    const claimsPath = path.join(cachePath, 'claims');
    fs.mkdirSync(claimsPath);
    fs.mkdirSync(path.join(claimsPath, 'claims.db'));

    await expect(cache.claimBackgroundUsageOnce('response')).rejects.toThrow(
      'Failed to persist a one-time cache claim',
    );
    await expect(cache.claimBackgroundUsageOnce('response')).rejects.toThrow(
      'Failed to persist a one-time cache claim',
    );
    fs.rmdirSync(path.join(claimsPath, 'claims.db'));
    expect(await cache.claimBackgroundUsageOnce('response')).toBe(true);
  });

  it('retains the synchronous public claim contract', () => {
    expect(cache.claimCacheKeyOnce('legacy-public-key')).toBe(true);
    expect(cache.claimCacheKeyOnce('legacy-public-key')).toBe(false);
  });

  it('rejects an expired deadline before storing a claim', async () => {
    await expect(
      cache.claimBackgroundUsageOnce('expired', { deadline: Date.now() - 1 }),
    ).rejects.toThrow('Timed out claiming background usage');
    expect(fs.existsSync(path.join(cachePath, 'claims'))).toBe(false);
    expect(await cache.claimBackgroundUsageOnce('expired')).toBe(true);
  });

  it.each(['cancellation', 'deadline'])(
    'rolls back a claim interrupted by %s before commit',
    async (reason) => {
      const controller = new AbortController();
      vi.useFakeTimers({ toFake: ['Date'] });
      const deadline = Date.now() + 5000;
      const prepare = DatabaseSync.prototype.prepare;
      vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementationOnce(function (
        this: DatabaseSync,
        sql,
      ) {
        if (reason === 'cancellation') {
          controller.abort();
        } else {
          vi.setSystemTime(deadline);
        }
        return prepare.call(this, sql);
      });
      await expect(
        cache.claimBackgroundUsageOnce('interrupted', { signal: controller.signal, deadline }),
      ).rejects.toThrow('Failed to persist a one-time cache claim');
      vi.useRealTimers();
      expect(await cache.claimBackgroundUsageOnce('interrupted')).toBe(true);
      expect(await cache.claimBackgroundUsageOnce('interrupted')).toBe(false);
    },
  );

  it('finishes a claim after notifying the subscriber that commit has started', async () => {
    const controller = new AbortController();
    const onCommit = vi.fn(() => controller.abort());
    expect(
      await cache.claimBackgroundUsageOnce('committed', { signal: controller.signal, onCommit }),
    ).toBe(true);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(await cache.claimBackgroundUsageOnce('committed')).toBe(false);
  });

  it('retries an extended busy code while opening the database', async () => {
    const open = vi
      .fn(function (...args: ConstructorParameters<typeof DatabaseSync>) {
        return new DatabaseSync(...args);
      })
      .mockImplementationOnce(function () {
        throw Object.assign(new Error('Database is busy'), { errcode: 261 });
      });
    const retry = vi.spyOn(await import('../src/util/time'), 'sleep').mockResolvedValue(undefined);
    vi.doMock('node:sqlite', () => ({ DatabaseSync: open }));
    try {
      expect(await cache.claimBackgroundUsageOnce('startup')).toBe(true);
      expect(open).toHaveBeenCalledTimes(2);
      expect(retry).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock('node:sqlite');
      retry.mockRestore();
    }
    expect(await cache.claimBackgroundUsageOnce('startup')).toBe(false);
  });

  it.each(['deadline', 'cancellation'])(
    'stops retrying database initialization after %s',
    async (reason) => {
      const open = vi.fn(function () {
        throw Object.assign(new Error('Database is locked'), { errcode: 6 });
      });
      const controller = new AbortController();
      vi.useFakeTimers({ toFake: ['Date'] });
      const deadline = Date.now() + 5000;
      const time = await import('../src/util/time');
      const retry = vi
        .spyOn(time, reason === 'deadline' ? 'sleep' : 'sleepWithAbort')
        .mockImplementation(async () => {
          if (reason === 'deadline') {
            vi.setSystemTime(deadline);
          } else {
            controller.abort();
            controller.signal.throwIfAborted();
          }
        });
      vi.doMock('node:sqlite', () => ({ DatabaseSync: open }));
      try {
        await expect(
          cache.claimBackgroundUsageOnce('startup-interrupted', {
            deadline,
            ...(reason === 'cancellation' ? { signal: controller.signal } : {}),
          }),
        ).rejects.toMatchObject({
          cause:
            reason === 'deadline'
              ? { message: 'Timed out claiming background usage' }
              : { name: 'AbortError' },
        });
        expect(open).toHaveBeenCalledOnce();
        expect(retry).toHaveBeenCalledOnce();
      } finally {
        vi.doUnmock('node:sqlite');
        retry.mockRestore();
        vi.useRealTimers();
      }
      expect(await cache.claimBackgroundUsageOnce('startup-interrupted')).toBe(true);
    },
  );

  it('bounds lock retries by the caller deadline and leaves failed claims retriable', async () => {
    const release = await holdClaimLock();
    vi.useFakeTimers({ toFake: ['Date'] });
    const deadline = Date.now() + 5000;
    const retry = vi
      .spyOn(await import('../src/util/time'), 'sleep')
      .mockImplementationOnce(async () => {
        vi.setSystemTime(deadline);
      });
    try {
      await expect(cache.claimBackgroundUsageOnce('locked', { deadline })).rejects.toMatchObject({
        cause: { message: 'Timed out claiming background usage' },
      });
      expect(retry).toHaveBeenCalledOnce();
    } finally {
      retry.mockRestore();
      vi.useRealTimers();
      release();
    }
    expect(await cache.claimBackgroundUsageOnce('locked')).toBe(true);
    expect(await cache.claimBackgroundUsageOnce('locked')).toBe(false);
  });

  it('lets cancellation interrupt a contended claim without blocking the event loop', async () => {
    const release = await holdClaimLock();
    const controller = new AbortController();
    const time = await import('../src/util/time');
    const sleepWithAbort = time.sleepWithAbort;
    const retry = vi.spyOn(time, 'sleepWithAbort').mockImplementationOnce((delay, signal) => {
      const sleeping = sleepWithAbort(delay, signal);
      controller.abort();
      return sleeping;
    });
    try {
      await expect(
        cache.claimBackgroundUsageOnce('cancelled', { signal: controller.signal }),
      ).rejects.toThrow('Failed to persist a one-time cache claim');
      expect(controller.signal.aborted).toBe(true);
      expect(retry).toHaveBeenCalledOnce();
    } finally {
      retry.mockRestore();
      release();
    }
    expect(await cache.claimBackgroundUsageOnce('cancelled')).toBe(true);
  });

  it('retries a lock that is released within the deadline', async () => {
    const release = await holdClaimLock();
    const retry = vi
      .spyOn(await import('../src/util/time'), 'sleep')
      .mockImplementationOnce(async () => release());
    try {
      expect(
        await cache.claimBackgroundUsageOnce('contended', { deadline: Date.now() + 2000 }),
      ).toBe(true);
      expect(retry).toHaveBeenCalled();
      expect(await cache.claimBackgroundUsageOnce('contended')).toBe(false);
    } finally {
      retry.mockRestore();
      release();
    }
  });

  it('allows exactly one claimant across independent processes', async () => {
    const workers = Array.from({ length: 2 }, () => {
      const child = fork(path.join(__dirname, 'fixtures/cacheClaim.ts'), [], {
        execArgv: ['--import', 'tsx'],
        env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1' },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      let stderr = '';
      child.stderr?.on('data', (chunk) => (stderr += chunk));
      const ready = new Promise<void>((resolve, reject) => {
        child.once('message', (message) => {
          if (message === 'ready') {
            resolve();
          } else {
            reject(new Error(`Unexpected worker message: ${JSON.stringify(message)}`));
          }
        });
        child.once('error', reject);
        child.once('exit', () => reject(new Error(`Worker exited before ready: ${stderr}`)));
      });
      const finished = new Promise<{ claimed: boolean }>((resolve, reject) => {
        let result: { claimed: boolean };
        child.on('message', (message) => {
          if (typeof message === 'object' && message !== null && 'claimed' in message) {
            result = message as { claimed: boolean };
          }
        });
        child.once('error', reject);
        child.once('close', (code) => {
          if (code === 0 && result) {
            resolve(result);
          } else {
            reject(new Error(`Claim worker failed (${code}): ${stderr}`));
          }
        });
      });
      return { child, ready, finished };
    });
    try {
      await Promise.all(workers.map((worker) => worker.ready));
      workers.forEach((worker) => worker.child.send('claim'));
      const results = await Promise.all(workers.map((worker) => worker.finished));
      expect(results.filter((result) => result.claimed)).toHaveLength(1);
    } finally {
      workers.forEach(({ child }) => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill();
        }
      });
      await Promise.allSettled(workers.map((worker) => worker.finished));
    }
  });
});
