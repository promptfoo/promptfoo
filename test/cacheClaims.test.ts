import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '../src/util/createHash';
import { mockProcessEnv } from './util/utils';

describe('persistent cache claims', () => {
  let cachePath: string;
  let cache: typeof import('../src/cache');

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
    expect(await cache.claimCacheKeyOnce('response')).toBe(true);
    vi.setSystemTime(now + 60_000);
    expect(await cache.claimCacheKeyOnce('response')).toBe(false);
    expect(await cache.claimCacheKeyOnce('next-response')).toBe(true);
    expect(fs.readdirSync(path.join(cachePath, 'claims'))).toEqual(['claims.db']);
  });

  it('isolates cache paths and namespaces', async () => {
    expect(await cache.claimCacheKeyOnce('response')).toBe(true);
    expect(
      await cache.withCacheNamespace('repeat:1', () => cache.claimCacheKeyOnce('response')),
    ).toBe(true);
    expect(
      await cache.withCacheNamespace('repeat:1', () => cache.claimCacheKeyOnce('response')),
    ).toBe(false);
    mockProcessEnv({ PROMPTFOO_CACHE_PATH: path.join(cachePath, 'other-cache') });
    expect(await cache.claimCacheKeyOnce('response')).toBe(true);
  });

  it('preserves legacy markers without creating an index or changing their age', async () => {
    const claimsPath = path.join(cachePath, 'claims');
    const hash = sha256('response');
    fs.mkdirSync(claimsPath);
    fs.writeFileSync(path.join(claimsPath, hash), '');
    fs.utimesSync(path.join(claimsPath, hash), 1, 1);

    expect(await cache.claimCacheKeyOnce('response')).toBe(false);
    expect(fs.statSync(path.join(claimsPath, hash)).mtimeMs).toBe(1000);
    expect(fs.readdirSync(claimsPath)).toEqual([hash]);
  });

  it('removes both storage formats only on an explicit cache clear', async () => {
    expect(await cache.claimCacheKeyOnce('response')).toBe(true);
    const claimsPath = path.join(cachePath, 'claims');
    fs.writeFileSync(path.join(claimsPath, sha256('legacy')), '');

    await cache.clearCache();

    expect(fs.existsSync(claimsPath)).toBe(false);
    expect(await cache.claimCacheKeyOnce('response')).toBe(true);
    expect(await cache.claimCacheKeyOnce('legacy')).toBe(true);
  });

  it('does not claim in memory when the durable index cannot be opened', async () => {
    const claimsPath = path.join(cachePath, 'claims');
    fs.mkdirSync(claimsPath);
    fs.mkdirSync(path.join(claimsPath, 'claims.db'));

    await expect(cache.claimCacheKeyOnce('response')).rejects.toThrow(
      'Failed to persist a one-time cache claim',
    );
    await expect(cache.claimCacheKeyOnce('response')).rejects.toThrow(
      'Failed to persist a one-time cache claim',
    );
    fs.rmdirSync(path.join(claimsPath, 'claims.db'));
    expect(await cache.claimCacheKeyOnce('response')).toBe(true);
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
      expect(await cache.claimCacheKeyOnce('shared-background-response')).toBe(false);
    } finally {
      workers.forEach((worker) => worker.child.kill());
    }
  });
});
