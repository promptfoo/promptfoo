import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient } from '@libsql/client/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '../src/util/createHash';
import { mockProcessEnv } from './util/utils';

describe('persistent cache claims', () => {
  let cachePath: string;
  let cache: typeof import('../src/cache');

  async function holdClaimLock() {
    await cache.claimBackgroundUsageOnce('initialize');
    const client = createClient({
      url: pathToFileURL(path.join(cachePath, 'claims/claims.db')).href,
      concurrency: 1,
    });
    const transaction = await client.transaction('write');
    return async () => {
      try {
        await transaction.rollback();
      } finally {
        client.close();
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
    vi.useRealTimers();
    fs.rmSync(cachePath, { recursive: true, force: true });
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

  it('bounds lock retries by the caller deadline and leaves failed claims retriable', async () => {
    const release = await holdClaimLock();
    try {
      await expect(
        cache.claimBackgroundUsageOnce('locked', { deadline: Date.now() + 80 }),
      ).rejects.toMatchObject({ cause: { message: 'Timed out claiming background usage' } });
    } finally {
      await release();
    }
    expect(await cache.claimBackgroundUsageOnce('locked')).toBe(true);
    expect(await cache.claimBackgroundUsageOnce('locked')).toBe(false);
  });

  it('lets cancellation interrupt a contended claim without blocking the event loop', async () => {
    const release = await holdClaimLock();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25);
    try {
      await expect(
        cache.claimBackgroundUsageOnce('cancelled', { signal: controller.signal }),
      ).rejects.toThrow('Failed to persist a one-time cache claim');
      expect(controller.signal.aborted).toBe(true);
    } finally {
      clearTimeout(timer);
      await release();
    }
    expect(await cache.claimBackgroundUsageOnce('cancelled')).toBe(true);
  });

  it('retries a lock that is released within the deadline', async () => {
    const release = await holdClaimLock();
    const pending = cache.claimBackgroundUsageOnce('contended', { deadline: Date.now() + 2000 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      await release();
    }
    expect(await pending).toBe(true);
    expect(await cache.claimBackgroundUsageOnce('contended')).toBe(false);
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
        child.once('exit', (code) => {
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
      expect(await cache.claimBackgroundUsageOnce('shared-background-response')).toBe(false);
    } finally {
      workers.forEach((worker) => worker.child.kill());
    }
  });
});
