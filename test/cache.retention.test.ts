import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, it } from 'vitest';

it('releases unused backends, TTL instances, and namespace wrappers', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cache-retention-'));
  try {
    const script = `
      import { setImmediate } from 'node:timers/promises';
      import * as cache from ${JSON.stringify(pathToFileURL(path.resolve(__dirname, '../src/cache.ts')).href)};
      import cliState from ${JSON.stringify(pathToFileURL(path.resolve(__dirname, '../src/cliState.ts')).href)};
      const backendRefs = [];
      const ttlRefs = [];
      const namespaceRefs = [];
      const customPath = ${JSON.stringify(directory)} + '/0';
      await cliState.withEnv({ PROMPTFOO_CACHE_TYPE: 'disk', PROMPTFOO_CACHE_PATH: customPath },
        () => cache.getCache().set('previous-result', 'stale'));
      for (let index = 0; index < 80; index++) {
        backendRefs.push(new WeakRef(cliState.withEnv({
          PROMPTFOO_CACHE_TYPE: 'disk',
          PROMPTFOO_CACHE_PATH: ${JSON.stringify(directory)} + '/' + index,
        }, () => cache.getCache())));
        ttlRefs.push(new WeakRef(cliState.withEnv({
          PROMPTFOO_CACHE_TYPE: 'memory', PROMPTFOO_CACHE_TTL: String(index),
        }, () => cache.getCache())));
        await cliState.withEnv({ PROMPTFOO_CACHE_TYPE: 'memory' }, () =>
          cache.withCacheNamespace('run-' + index, async () => {
            namespaceRefs.push(new WeakRef(cache.getCache()));
          }),
        );
      }
      for (let turn = 0; turn < 3; turn++) {
        await setImmediate();
        global.gc();
      }
      await cache.clearCache(customPath);
      const customResult = await cliState.withEnv({
        PROMPTFOO_CACHE_TYPE: 'disk', PROMPTFOO_CACHE_PATH: customPath,
      }, () => cache.getCache().get('previous-result'));
      console.log(JSON.stringify({
        backends: backendRefs.filter(ref => ref.deref()).length,
        ttls: ttlRefs.filter(ref => ref.deref()).length,
        namespaces: namespaceRefs.filter(ref => ref.deref()).length,
        customCleared: customResult === undefined,
      }));
    `;
    const child = spawnSync(
      process.execPath,
      ['--expose-gc', '--import', 'tsx', '--input-type=module', '--eval', script],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, LOG_LEVEL: 'error' },
        encoding: 'utf8',
      },
    );
    expect(child.status, child.stderr).toBe(0);
    const retained = JSON.parse(child.stdout.trim());
    expect(retained.backends).toBeLessThanOrEqual(32);
    expect(retained.ttls).toBeLessThanOrEqual(16);
    expect(retained.namespaces).toBe(0);
    expect(retained.customCleared).toBe(true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
