import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred, createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';
import type { KeyvFile } from 'keyv-file';

import type { ProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import type { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import type { ApiProvider } from '../../src/types/providers';

// Cache type is captured on import. Load the entire provider/matcher graph after
// selecting a fresh disk cache, rather than reusing the test setup's memory cache.
async function loadDiskModules() {
  const [cache, loader, chat, wrapper, registry, slots, execution, grading, disk] =
    await Promise.all([
      import('../../src/cache'),
      import('../../src/providers/index'),
      import('../../src/providers/openai/chat'),
      import('../../src/scheduler/providerWrapper'),
      import('../../src/scheduler/rateLimitRegistry'),
      import('../../src/scheduler/slotQueue'),
      import('../../src/scheduler/providerCallExecutionContext'),
      import('../../src/matchers/llmGrading'),
      import('keyv-file'),
    ]);
  return { cache, loader, chat, wrapper, registry, slots, execution, grading, disk };
}

const grade = { pass: true, score: 1, reason: 'B grading completed' };
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
const headers = { 'content-type': 'application/json', 'x-request-id': 'disk-quota-fixture' };
const firstPayload = {
  choices: [
    { message: { role: 'assistant', content: 'A completed response' }, finish_reason: 'stop' },
  ],
  usage,
};
const secondPayload = {
  choices: [
    { message: { role: 'assistant', content: JSON.stringify(grade) }, finish_reason: 'stop' },
  ],
  usage,
};
const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';

describe('Chat completed quota during default disk publication', () => {
  let modules: Awaited<ReturnType<typeof loadDiskModules>>;
  let cacheDirectory: string;
  let restoreEnvironment: () => void;
  const registries: RateLimitRegistry[] = [];
  const providers: ApiProvider[] = [];
  const controllers: AbortController[] = [];
  const pendingCalls: Promise<unknown>[] = [];
  const diskWrites: Promise<unknown>[] = [];
  let cancellationTimer: ReturnType<typeof setTimeout> | undefined;

  beforeEach(async () => {
    vi.resetModules();
    // This test intentionally uses ordinary timers and the real filesystem: the
    // default KeyvFile publication interval is the cancellation window under test.
    vi.useRealTimers();
    cacheDirectory = createTempDir('promptfoo-chat-disk-publication-quota-');
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      PROMPTFOO_CACHE_TYPE: 'disk',
      PROMPTFOO_CACHE_PATH: cacheDirectory,
      PROMPTFOO_CACHE_ENABLED: 'true',
      PROMPTFOO_CACHE_TTL: '1209600',
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    modules = await loadDiskModules();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    if (cancellationTimer !== undefined) {
      clearTimeout(cancellationTimer);
      cancellationTimer = undefined;
    }
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    for (const registry of registries.splice(0)) {
      registry.dispose();
    }
    await Promise.allSettled(pendingCalls.splice(0));
    // KeyvFile.disconnect does not flush writes. Drain real saves before removing
    // only this test's temporary directory; never clear an existing cache.
    await Promise.allSettled(diskWrites.splice(0));
    for (const provider of providers.splice(0)) {
      await provider.cleanup?.();
    }
    await modules.cache.getCache().disconnect();
    vi.restoreAllMocks();
    restoreEnvironment();
    removeTempDir(cacheDirectory);
  });

  it.each([
    { boundary: 'wrapper', traced: false, alreadyWrapped: true },
    { boundary: 'grader', traced: false, alreadyWrapped: false },
    { boundary: 'grader', traced: true, alreadyWrapped: false },
    { boundary: 'grader', traced: true, alreadyWrapped: true },
  ] as const)(
    'learns fresh quota before a publication timeout ($boundary, traced=$traced, wrapped=$alreadyWrapped)',
    async ({ boundary, traced, alreadyWrapped }) => {
      const cache = modules.cache.getCache();
      expect(cache.stores).toHaveLength(1);
      const disk = cache.stores[0].store as KeyvFile;
      expect(disk).toBeInstanceOf(modules.disk.KeyvFile);
      expect(disk.opts.filename).toBe(path.join(cacheDirectory, 'cache.json'));
      expect(disk.opts.writeDelay).toBe(100);
      const cacheSet = vi.spyOn(cache, 'set');
      const publicationStarted = createDeferred<void>();
      const secondQueued = createDeferred<void>();
      const events: string[] = [];
      let firstPublicationSettled = false;
      const originalSet = disk.set.bind(disk);
      vi.spyOn(disk, 'set').mockImplementation((key, value, ttl) => {
        const firstWrite = diskWrites.length === 0;
        // Delegate unchanged: KeyvFile schedules its own default delay and real I/O.
        const publication = originalSet(key, value, ttl);
        diskWrites.push(publication);
        void publication.then(
          () => {
            if (firstWrite) {
              firstPublicationSettled = true;
              events.push('A publication completed');
            }
          },
          () => {
            if (firstWrite) {
              firstPublicationSettled = true;
            }
          },
        );
        if (firstWrite) {
          events.push('A publication started');
          publicationStarted.resolve();
        }
        return publication;
      });

      const target = await modules.loader.loadApiProvider('openai:chat:gpt-4o-mini', {
        options: {
          config: {
            apiBaseUrl: 'https://disk-quota.fixture.test/v1',
            apiKey: 'fixture-key',
            maxRetries: 3,
          },
        },
      });
      providers.push(target);
      expect(target).toBeInstanceOf(modules.chat.OpenAiChatCompletionProvider);
      const registry = new modules.registry.RateLimitRegistry({ maxConcurrency: 1 });
      registries.push(registry);
      const contextRegistry =
        alreadyWrapped && boundary === 'grader'
          ? new modules.registry.RateLimitRegistry({ maxConcurrency: 1 })
          : registry;
      if (contextRegistry !== registry) {
        registries.push(contextRegistry);
      }
      const provider = alreadyWrapped
        ? modules.wrapper.wrapProviderWithRateLimiting(target, registry)
        : target;
      const firstController = new AbortController();
      const secondController = new AbortController();
      controllers.push(firstController, secondController);
      const reason = Object.freeze(
        Object.assign(new Error('A timed out during disk publication'), {
          name: traced ? 'AbortException' : 'AbortError',
        }),
      );
      const providerSpan = vi.fn<ProviderCallTracingContext['withProviderSpan']>(
        async ({ callContext }, invoke) => invoke({ ...callContext!, traceparent }),
      );
      const runCall = (prompt: string, signal: AbortSignal) => {
        if (boundary === 'wrapper') {
          return provider.callApi(prompt, undefined, { abortSignal: signal });
        }
        return modules.execution.withProviderCallExecutionContext(
          { abortSignal: signal, rateLimitRegistry: contextRegistry },
          () => {
            const invoke = () =>
              modules.grading.matchesLlmRubric('must pass', prompt, {
                provider,
                rubricPrompt: 'Grade {{output}}.',
              });
            return traced
              ? modules.execution.withProviderCallTracingContext(
                  {
                    getActiveTraceparent: () => traceparent,
                    withGraderSpan: async (_options, callback) => callback(),
                    withProviderSpan: providerSpan,
                  },
                  invoke,
                )
              : invoke();
          },
        );
      };
      const release = vi.spyOn(modules.slots.SlotQueue.prototype, 'release');
      const updateQuota = vi.spyOn(modules.slots.SlotQueue.prototype, 'updateRateLimitState');
      const learned = vi.fn();
      const retrying = vi.fn();
      registry.on('ratelimit:learned', learned);
      registry.on('request:retrying', retrying);
      let startedRequests = 0;
      registry.on('request:started', () => {
        startedRequests++;
        if (startedRequests === 2) {
          secondQueued.resolve();
        }
      });

      const resetAt = Date.now() + 1000;
      const quotaHeaders = {
        ...headers,
        'ratelimit-limit': '10',
        'ratelimit-remaining': '0',
        'ratelimit-reset': new Date(resetAt).toISOString(),
      };
      // Static native bodies: no response methods, header accessors, or signals
      // are modified to manufacture a cancellation ordering.
      const firstResponse = new Response(JSON.stringify(firstPayload), {
        status: 200,
        statusText: 'OK',
        headers: quotaHeaders,
      });
      const secondResponse = new Response(JSON.stringify(secondPayload), {
        status: 200,
        statusText: 'OK',
        headers,
      });
      let secondDispatchAt: number | undefined;
      vi.mocked(globalThis.fetch)
        .mockImplementationOnce(async () => {
          events.push('A dispatched');
          return firstResponse;
        })
        .mockImplementationOnce(async () => {
          events.push('B dispatched');
          secondDispatchAt = Date.now();
          return secondResponse;
        });

      const first = runCall('A prompt', firstController.signal).catch((error: unknown) => error);
      pendingCalls.push(first);
      await publicationStarted.promise;
      expect(firstResponse.bodyUsed).toBe(true);
      expect(cacheSet).toHaveBeenCalledOnce();
      // Storage received the fully parsed body and its headers before the timer.
      expect(JSON.parse(cacheSet.mock.calls[0][1] as string)).toMatchObject({
        data: firstPayload,
        status: 200,
        statusText: 'OK',
        headers: quotaHeaders,
      });
      expect(firstPublicationSettled).toBe(false);

      let abortedAt: number | undefined;
      let abortedDuringPublication = false;
      cancellationTimer = setTimeout(() => {
        abortedAt = Date.now();
        abortedDuringPublication = !firstPublicationSettled;
        events.push('A timeout');
        firstController.abort(reason);
      }, 30);
      const second = runCall('B prompt', secondController.signal).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      pendingCalls.push(second);
      await secondQueued.promise;
      expect(Object.values(registry.getMetrics())).toHaveLength(1);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        totalRequests: 2,
        activeRequests: 1,
        queueDepth: 1,
      });
      events.push('B queued');
      expect(release).not.toHaveBeenCalled();
      expect(await first).toBe(reason);
      expect(abortedDuringPublication).toBe(true);
      expect(abortedAt).toBeLessThan(resetAt);
      expect(firstPublicationSettled).toBe(false);
      // Let a wrongly released B reach transport before inspecting dispatch,
      // rather than failing first on the missing quota-learning observation.
      await setImmediate();
      expect(events).toEqual(['A dispatched', 'A publication started', 'B queued', 'A timeout']);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(secondController.signal.aborted).toBe(false);
      expect(release).toHaveBeenCalledOnce();
      expect(learned).toHaveBeenCalledOnce();
      expect(updateQuota).toHaveBeenCalledOnce();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
        completedRequests: 0,
        failedRequests: 1,
        retriedRequests: 0,
        rateLimitHits: 0,
      });

      await diskWrites[0];
      expect(firstPublicationSettled).toBe(true);
      expect(Date.now()).toBeLessThan(resetAt);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(await readFile(path.join(cacheDirectory, 'cache.json'), 'utf8')).toContain(
        'A completed response',
      );
      await expect(second).resolves.toMatchObject({
        value: boundary === 'wrapper' ? { output: JSON.stringify(grade) } : grade,
      });
      expect(secondDispatchAt).toBeGreaterThanOrEqual(resetAt);
      expect(events.indexOf('B dispatched')).toBeGreaterThan(
        events.indexOf('A publication completed'),
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalledTimes(2);
      expect(updateQuota).toHaveBeenCalledTimes(2);
      expect(learned).toHaveBeenCalledOnce();
      expect(retrying).not.toHaveBeenCalled();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        totalRequests: 2,
        activeRequests: 0,
        queueDepth: 0,
        completedRequests: 1,
        failedRequests: 1,
        retriedRequests: 0,
        rateLimitHits: 0,
      });
      if (contextRegistry !== registry) {
        expect(contextRegistry.getMetrics()).toEqual({});
      }
      expect(providerSpan).toHaveBeenCalledTimes(traced ? 2 : 0);
      if (traced) {
        expect(providerSpan).toHaveBeenCalledWith(
          expect.objectContaining({ provider, role: 'grader', promptLabel: 'llm-rubric' }),
          expect.any(Function),
        );
      }
    },
  );
});
