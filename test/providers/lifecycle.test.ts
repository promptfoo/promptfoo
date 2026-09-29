import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateWithSource } from '../../src/evaluate';
import logger from '../../src/logger';
import { loadApiProvider, loadApiProviders } from '../../src/providers/index';
import { cleanupProvider, trackProvider, withProviderCleanup } from '../../src/providers/lifecycle';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { createDeferred } from '../util/utils';

import type { ApiProvider, ProviderOptions } from '../../src/types/providers';

const providerPath = path.resolve('test/fixtures/providers/cleanup-provider.mjs');
const providerOptions = (config: Record<string, unknown> = {}): ProviderOptions => ({
  id: providerPath,
  config: { cleanup: vi.fn(), ...config },
});
const makeProvider = (cleanup = vi.fn()): ApiProvider => ({
  id: () => 'owned',
  callApi: async () => ({ output: 'ok' }),
  cleanup,
});

afterEach(() => vi.restoreAllMocks());

describe('provider cleanup ownership', () => {
  it('keeps direct loader results caller-owned', async () => {
    const cleanup = vi.fn();
    const provider = await loadApiProvider(providerPath, { options: providerOptions({ cleanup }) });
    expect(cleanup).not.toHaveBeenCalled();
    await provider.cleanup?.();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('cleans a configured provider after programmatic evaluation', async () => {
    const cleanup = vi.fn();
    const result = await evaluateWithSource(
      {
        prompts: ['hello'],
        providers: [providerOptions({ cleanup })],
        tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
      },
      { cache: false },
    );
    expect(result.prompts[0].metrics?.testPassCount).toBe(1);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('cleans a lazily constructed grading provider', async () => {
    const cleanup = vi.fn();
    const result = await evaluateWithSource(
      {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [
          {
            options: {
              provider: {
                text: providerOptions({ cleanup, output: '{"pass":true,"score":1,"reason":"ok"}' }),
              },
            },
            assert: [{ type: 'llm-rubric', value: 'returns hello' }],
          },
        ],
      },
      { cache: false },
    );
    expect(result.prompts[0].metrics?.testPassCount).toBe(1);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('leaves caller-supplied target and grader instances open', async () => {
    const cleanup = vi.fn();
    const target = makeProvider(cleanup);
    const grader = {
      ...makeProvider(cleanup),
      callApi: async () => ({ output: '{"pass":true,"score":1,"reason":"ok"}' }),
    };
    await evaluateWithSource(
      {
        prompts: ['hello'],
        providers: [target],
        tests: [
          {
            options: { provider: { text: grader } },
            assert: [{ type: 'llm-rubric', value: 'ok' }],
          },
        ],
      },
      { cache: false },
    );
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('cleans constructed test providers when a later test cannot load', async () => {
    const cleanup = vi.fn();
    await expect(
      evaluateWithSource(
        {
          prompts: ['hello'],
          providers: ['echo'],
          tests: [
            { provider: providerOptions({ cleanup }) },
            { provider: providerOptions({ fail: true }) },
          ],
        },
        { cache: false },
      ),
    ).rejects.toThrow('provider load failed');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each([false, true])('cleans partial batch loads once (scoped=%s)', async (scoped) => {
    const cleanup = vi.fn();
    const borrowed = makeProvider();
    const load = () =>
      loadApiProviders([borrowed, providerOptions({ cleanup }), providerOptions({ fail: true })]);
    await expect(scoped ? withProviderCleanup(load) : load()).rejects.toThrow(
      'provider load failed',
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(borrowed.cleanup).not.toHaveBeenCalled();
  });

  it('cleans a late load after a sibling fails without waiting for it', async () => {
    const loaded = createDeferred<void>();
    const cleaned = createDeferred<void>();
    const cleanup = vi.fn(() => cleaned.resolve());
    await expect(
      withProviderCleanup(() =>
        loadApiProviders([
          providerOptions({ cleanup, waitForLoad: () => loaded.promise }),
          providerOptions({ fail: true }),
        ]),
      ),
    ).rejects.toThrow('provider load failed');
    expect(cleanup).not.toHaveBeenCalled();
    loaded.resolve();
    await cleaned.promise;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('keeps simultaneous evaluation ownership separate', async () => {
    const releaseFirst = createDeferred<void>();
    const enteredFirst = createDeferred<void>();
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    const first = evaluateWithSource(
      {
        prompts: ['first'],
        providers: [
          providerOptions({
            cleanup: firstCleanup,
            call: () => {
              enteredFirst.resolve();
              return releaseFirst.promise;
            },
          }),
        ],
        tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
      },
      { cache: false },
    );
    await enteredFirst.promise;
    await evaluateWithSource(
      {
        prompts: ['second'],
        providers: [providerOptions({ cleanup: secondCleanup })],
        tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
      },
      { cache: false },
    );
    expect(secondCleanup).toHaveBeenCalledOnce();
    expect(firstCleanup).not.toHaveBeenCalled();
    releaseFirst.resolve();
    await first;
    expect(firstCleanup).toHaveBeenCalledOnce();
  });

  it('deduplicates batch and scope cleanup and awaits async hooks', async () => {
    const release = createDeferred<void>();
    const entered = createDeferred<void>();
    const cleanup = vi.fn(async () => {
      entered.resolve();
      await release.promise;
    });
    const provider = makeProvider(cleanup);
    let completed = false;
    const run = withProviderCleanup(async () => {
      trackProvider(provider);
      trackProvider(provider);
      await cleanupProvider(provider);
    }).then(() => {
      completed = true;
    });
    await entered.promise;
    expect(completed).toBe(false);
    release.resolve();
    await run;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('cleans every provider even when one synchronous hook throws', async () => {
    const error = new Error('cleanup failed');
    const second = makeProvider();
    await expect(
      withProviderCleanup(async () => {
        trackProvider(
          makeProvider(
            vi.fn(() => {
              throw error;
            }),
          ),
        );
        trackProvider(second);
      }),
    ).rejects.toBe(error);
    expect(second.cleanup).toHaveBeenCalledOnce();
  });

  it('preserves the original operation failure when cleanup also fails', async () => {
    const error = new Error('evaluation failed');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await expect(
      withProviderCleanup(async () => {
        trackProvider(
          makeProvider(
            vi.fn(() => {
              throw new Error('cleanup failed');
            }),
          ),
        );
        throw error;
      }),
    ).rejects.toBe(error);
    expect(warn).toHaveBeenCalledWith('Provider cleanup failed after evaluation error', {
      error: expect.any(Error),
    });
  });

  it('leaves process-registered providers to their shutdown owner', async () => {
    const provider = { ...makeProvider(), shutdown: vi.fn(async () => {}) };
    providerRegistry.register(provider);
    try {
      await withProviderCleanup(async () => {
        trackProvider(provider);
        providerRegistry.unregister(provider);
      });
      expect(provider.cleanup).not.toHaveBeenCalled();
    } finally {
      providerRegistry.unregister(provider);
    }
  });
});
