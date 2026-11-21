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

it.each([
  { providerKind: 'tts', axis: 'namespace' },
  { providerKind: 'tts', axis: 'backend' },
  { providerKind: 'anthropic', axis: 'namespace' },
  { providerKind: 'responses-creation', axis: 'namespace' },
  { providerKind: 'responses-polling', axis: 'namespace' },
])(
  'retains active $providerKind requests across $axis eviction and GC',
  ({ providerKind, axis }) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-provider-retention-'));
    try {
      const script = `
      import { setImmediate } from 'node:timers/promises';
      const providerKind = ${JSON.stringify(providerKind)};
      const axis = ${JSON.stringify(axis)};
      const directory = ${JSON.stringify(directory)};
      const background = providerKind.startsWith('responses-');
      const gate = Promise.withResolvers();
      const entered = Promise.withResolvers();
      let calls = 0;
      globalThis.fetch = async request => {
        const url = String(request?.url ?? request);
        if (!['https://api.openai.com/v1/audio/speech', 'https://api.anthropic.com/v1/messages', 'https://api.openai.com/v1/responses', 'https://api.openai.com/v1/responses/resp_shared'].includes(url)) {
          throw new Error('Unexpected network request: ' + url);
        }
        if (providerKind === 'responses-polling' && url.endsWith('/responses')) {
          return Response.json({ id: 'resp_shared', status: 'queued', output: [], usage: null });
        }
        const requestIndex = ++calls;
        entered.resolve();
        await gate.promise;
        if (background) {
          return Response.json({ id: 'resp_shared', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'fixture answer' }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
        }
        return providerKind === 'tts'
          ? new Response('audio-' + requestIndex)
          : Response.json({
              id: 'msg_fixture', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6',
              content: [{ type: 'text', text: 'fixture answer' }], stop_reason: 'end_turn',
              usage: { input_tokens: 1, output_tokens: 1 },
            });
      };
      const cache = await import(${JSON.stringify(pathToFileURL(path.resolve(__dirname, '../src/cache.ts')).href)});
      const { default: cliState } = await import(${JSON.stringify(pathToFileURL(path.resolve(__dirname, '../src/cliState.ts')).href)});
      const Provider = background
        ? (await import(${JSON.stringify(pathToFileURL(path.resolve(__dirname, '../src/providers/openai/responses.ts')).href)})).OpenAiResponsesProvider
        : providerKind === 'tts'
          ? (await import(${JSON.stringify(pathToFileURL(path.resolve(__dirname, '../src/providers/openai/tts.ts')).href)})).OpenAiTtsProvider
          : (await import(${JSON.stringify(pathToFileURL(path.resolve(__dirname, '../src/providers/anthropic/messages.ts')).href)})).AnthropicMessagesProvider;
      const provider = new Provider(background ? 'gpt-4.1' : providerKind === 'tts' ? 'tts-1' : 'claude-sonnet-4-6', {
        config: { apiKey: 'fixture-api-key', maxRetries: 0, ...(background ? { background: true } : {}) },
      });
      const env = { PROMPTFOO_CACHE_TYPE: 'disk', PROMPTFOO_CACHE_PATH: directory + '/active' };
      const call = () => cliState.withEnv(env, () => cache.withCacheNamespace('active', () => provider.callApi('fixture')));
      const pending = call();
      await entered.promise;
      for (let index = 0; index < 80; index++) {
        await cliState.withEnv(
          axis === 'namespace' ? env : { ...env, PROMPTFOO_CACHE_PATH: directory + '/other-' + index },
          () => cache.withCacheNamespace('other-' + index, async () => cache.getCacheClearGeneration()),
        );
      }
      for (let turn = 0; turn < 3; turn++) {
        await setImmediate();
        global.gc();
      }
      // TTS and background Responses share concurrent requests; Anthropic caches completed responses.
      const concurrent = providerKind !== 'anthropic' ? call() : undefined;
      await setImmediate();
      gate.resolve();
      const first = await pending;
      const joined = concurrent ? await concurrent : undefined;
      const concurrentRequests = calls;
      const repeated = await call();
      console.log(JSON.stringify({ calls, firstError: first.error, firstOutput: first.output, concurrentError: joined?.error, concurrentOutput: joined?.output, repeatedError: repeated.error, repeatedOutput: repeated.output, cached: repeated.cached, ...(background ? { concurrentRequests } : {}) }));
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
      const output = providerKind === 'tts' ? 'Generated 7 characters of speech' : 'fixture answer';
      expect(JSON.parse(child.stdout.trim())).toEqual({
        calls: providerKind.startsWith('responses-') ? 2 : 1,
        cached: !providerKind.startsWith('responses-'),
        firstOutput: output,
        repeatedOutput: output,
        ...(providerKind === 'anthropic' ? {} : { concurrentOutput: output }),
        ...(providerKind.startsWith('responses-') ? { concurrentRequests: 1 } : {}),
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);

it.each(['namespace', 'backend'] as const)(
  'retains idle Anthropic response entries across %s eviction and GC',
  (axis) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-anthropic-idle-'));
    try {
      const script = `
        import { setImmediate } from 'node:timers/promises';
        let calls = 0;
        globalThis.fetch = async request => {
          if (String(request?.url ?? request) !== 'https://api.anthropic.com/v1/messages') {
            throw new Error('Unexpected network request');
          }
          calls++;
          return Response.json({
            id: 'msg_fixture', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6',
            content: [{ type: 'text', text: 'fixture answer' }], stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          });
        };
        const cache = await import(${JSON.stringify(pathToFileURL(path.resolve(__dirname, '../src/cache.ts')).href)});
        const { default: cliState } = await import(${JSON.stringify(pathToFileURL(path.resolve(__dirname, '../src/cliState.ts')).href)});
        const { AnthropicMessagesProvider } = await import(${JSON.stringify(pathToFileURL(path.resolve(__dirname, '../src/providers/anthropic/messages.ts')).href)});
        const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
          config: { apiKey: 'fixture-key', maxRetries: 0 },
        });
        const directory = ${JSON.stringify(directory)};
        const env = { PROMPTFOO_CACHE_TYPE: 'disk', PROMPTFOO_CACHE_PATH: directory + '/active' };
        const inScope = fn => cliState.withEnv(env, () => cache.withCacheNamespace('idle', fn));
        const call = () => inScope(() => provider.callApi('fixture'));
        const first = await call();
        const control = await call();
        const generation = await inScope(async () => cache.getCacheClearGeneration());
        for (let index = 0; index < 80; index++) {
          await cliState.withEnv(
            ${JSON.stringify(axis)} === 'namespace' ? env : { ...env, PROMPTFOO_CACHE_PATH: directory + '/other-' + index },
            () => cache.withCacheNamespace('other-' + index, async () => cache.getCacheClearGeneration()),
          );
        }
        for (let turn = 0; turn < 5; turn++) {
          await setImmediate();
          global.gc();
        }
        const retained = generation === await inScope(async () => cache.getCacheClearGeneration());
        const repeated = await call();
        const callsBeforeClear = calls;
        await inScope(() => cache.getCache().clear());
        const afterClear = await call();
        console.log(JSON.stringify({
          retained, callsBeforeClear, calls, firstError: first.error, controlCached: control.cached,
          repeatedError: repeated.error, repeatedOutput: repeated.output, repeatedCached: repeated.cached,
          afterClearError: afterClear.error, afterClearOutput: afterClear.output,
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
      expect(JSON.parse(child.stdout.trim())).toEqual({
        retained: true,
        callsBeforeClear: 1,
        calls: 2,
        controlCached: true,
        repeatedOutput: 'fixture answer',
        repeatedCached: true,
        afterClearOutput: 'fixture answer',
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
