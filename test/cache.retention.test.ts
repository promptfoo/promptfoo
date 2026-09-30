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
      const disabledRefs = [];
      const customPath = ${JSON.stringify(directory)} + '/0';
      const pendingEnv = {
        PROMPTFOO_CACHE_TYPE: 'disk',
        PROMPTFOO_CACHE_PATH: ${JSON.stringify(directory)} + '/pending',
      };
      let releaseWrite;
      const writeGate = new Promise(resolve => { releaseWrite = resolve; });
      let pendingStoreRef;
      const pendingWrite = cliState.withEnv(pendingEnv, () => {
        const selected = cache.getCache();
        const store = selected.stores[0].opts.store;
        pendingStoreRef = new WeakRef(store);
        const set = store.set.bind(store);
        store.set = async (...args) => {
          await writeGate;
          return set(...args);
        };
        return selected.set('pending-result', 'preserved');
      });
      await cliState.withEnv({ PROMPTFOO_CACHE_TYPE: 'disk', PROMPTFOO_CACHE_PATH: customPath },
        () => cache.getCache().set('previous-result', 'stale'));
      let releaseFetch;
      let enterFetch;
      let fetchCalls = 0;
      const fetchGate = new Promise(resolve => { releaseFetch = resolve; });
      const fetchEntered = new Promise(resolve => { enterFetch = resolve; });
      globalThis.fetch = async url => {
        if (String(url) !== 'https://retention-fixture.invalid/response') {
          throw new Error('Unexpected network request');
        }
        fetchCalls++;
        if (fetchCalls === 1) {
          enterFetch();
          await fetchGate;
          return Response.json('old');
        }
        return Response.json('fresh');
      };
      const inPendingNamespace = fn => cliState.withEnv({ PROMPTFOO_CACHE_TYPE: 'memory' },
        () => cache.withCacheNamespace('pending-fetch', fn));
      const pendingGeneration = await inPendingNamespace(async () => cache.getCacheClearGeneration());
      const call = () => cache.fetchWithCache('https://retention-fixture.invalid/response');
      const pendingFetch = inPendingNamespace(call);
      await fetchEntered;
      for (let index = 0; index < 80; index++) {
        await cache.withCacheEnabled(false, async () => {
          disabledRefs.push(new WeakRef(cache.getCache()));
        });
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
            cache.getCacheClearGeneration();
          }),
        );
      }
      for (let turn = 0; turn < 3; turn++) {
        await setImmediate();
        global.gc();
      }
      const returned = cliState.withEnv(pendingEnv, () => cache.getCache());
      const pendingWriterShared = returned.stores[0].opts.store === pendingStoreRef.deref();
      releaseWrite();
      await pendingWrite;
      const pendingResult = await returned.get('pending-result');
      const activeGenerationRetained = pendingGeneration ===
        await inPendingNamespace(async () => cache.getCacheClearGeneration());
      await inPendingNamespace(() => cache.getCache().clear());
      releaseFetch();
      await pendingFetch;
      const afterClear = await inPendingNamespace(call);
      const cachedAfterClear = await inPendingNamespace(call);
      await cache.clearCache(customPath);
      const customResult = await cliState.withEnv({
        PROMPTFOO_CACHE_TYPE: 'disk', PROMPTFOO_CACHE_PATH: customPath,
      }, () => cache.getCache().get('previous-result'));
      console.log(JSON.stringify({
        backends: backendRefs.filter(ref => ref.deref()).length,
        disabled: disabledRefs.filter(ref => ref.deref()).length,
        ttls: ttlRefs.filter(ref => ref.deref()).length,
        namespaces: namespaceRefs.filter(ref => ref.deref()).length,
        customCleared: customResult === undefined,
        pendingWriterShared,
        pendingResult,
        activeGenerationRetained,
        freshAfterClear: afterClear.data === 'fresh' && !afterClear.cached &&
          cachedAfterClear.cached && fetchCalls === 2,
      }));
    `;
    const child = spawnSync(
      process.execPath,
      ['--expose-gc', '--import', 'tsx', '--input-type=module', '--eval', script],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, LOG_LEVEL: 'error', PROMPTFOO_DISABLE_TELEMETRY: 'true' },
        encoding: 'utf8',
      },
    );
    expect(child.status, child.stderr).toBe(0);
    const retained = JSON.parse(child.stdout.trim());
    expect(retained.backends).toBeLessThanOrEqual(32);
    expect(retained.disabled).toBe(0);
    expect(retained.ttls).toBeLessThanOrEqual(16);
    expect(retained.namespaces).toBe(0);
    expect(retained.customCleared).toBe(true);
    expect(retained.pendingWriterShared).toBe(true);
    expect(retained.pendingResult).toBe('preserved');
    expect(retained.activeGenerationRetained).toBe(true);
    expect(retained.freshAfterClear).toBe(true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
