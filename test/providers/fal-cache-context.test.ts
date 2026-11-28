import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { FalImageGenerationProvider } from '../../src/providers/fal';

import type { CallApiContextParams } from '../../src/types/providers';

const { subscribe } = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock('@fal-ai/client', () => ({
  createFalClient: () => ({ subscribe }),
}));

const namespace = 'fal-cache-context';
const prompt = 'A landscape';
const context: CallApiContextParams = { prompt: { raw: prompt, label: prompt }, vars: {} };

describe('FAL per-call cache overrides', () => {
  let provider: FalImageGenerationProvider;
  const callApi = (flags?: Partial<CallApiContextParams>) =>
    withCacheNamespace(namespace, () =>
      provider.callApi(prompt, flags ? { ...context, ...flags } : undefined),
    );
  const output = (index: number) => `![${prompt}](https://example.com/image-${index}.png)`;

  beforeEach(() => {
    subscribe.mockReset();
    subscribe.mockImplementation(async () => ({
      data: { images: [{ url: `https://example.com/image-${subscribe.mock.calls.length}.png` }] },
      requestId: 'test-request',
    }));
    provider = new FalImageGenerationProvider('fal-ai/flux/dev', {
      config: { apiKey: 'test-key' },
    });
  });

  afterEach(async () => {
    // The test setup uses memory storage; clear only this suite's namespace.
    await withCacheNamespace(namespace, () => getCache().clear());
    vi.resetAllMocks();
  });

  it.each([
    { name: 'absent context', flags: undefined, bypass: false },
    { name: 'empty flags', flags: {}, bypass: false },
    { name: 'bustCache true', flags: { bustCache: true }, bypass: true },
    { name: 'debug true', flags: { debug: true }, bypass: true },
    { name: 'debug false', flags: { debug: false }, bypass: false },
    { name: 'explicit false over debug', flags: { bustCache: false, debug: true }, bypass: false },
    { name: 'explicit true over debug', flags: { bustCache: true, debug: false }, bypass: true },
  ])('honors $name without replacing cached output', async ({ flags, bypass }) => {
    await withCacheEnabled(true, async () => {
      expect(await callApi()).toEqual({ output: output(1), cached: false });
      expect(await callApi(flags)).toEqual({
        output: output(bypass ? 2 : 1),
        cached: !bypass,
      });
      expect(await callApi()).toEqual({ output: output(1), cached: true });
      expect(subscribe).toHaveBeenCalledTimes(bypass ? 2 : 1);
    });
  });

  it.each([{ bustCache: true }, { debug: true }])(
    'does not seed the cache when bypassing with %j',
    async (flags) => {
      await withCacheEnabled(true, async () => {
        expect(await callApi(flags)).toEqual({ output: output(1), cached: false });
        expect(await callApi()).toEqual({ output: output(2), cached: false });
        expect(await callApi()).toEqual({ output: output(2), cached: true });
        expect(subscribe).toHaveBeenCalledTimes(2);
      });
    },
  );

  it.each([{ bustCache: true }, { debug: true }])(
    'surfaces inference failure instead of cached output with %j',
    async (flags) => {
      await withCacheEnabled(true, async () => {
        await callApi();
        subscribe.mockRejectedValueOnce(new Error('inference unavailable'));
        await expect(callApi(flags)).rejects.toThrow('inference unavailable');
        expect(await callApi()).toEqual({ output: output(1), cached: true });
        expect(subscribe).toHaveBeenCalledTimes(2);
      });
    },
  );

  it('preserves globally disabled caching even with an explicit false override', async () => {
    await withCacheEnabled(false, async () => {
      expect(await callApi({ bustCache: false })).toEqual({ output: output(1), cached: false });
      expect(await callApi({ bustCache: false })).toEqual({ output: output(2), cached: false });
    });
    await withCacheEnabled(true, async () => {
      expect(await callApi()).toEqual({ output: output(3), cached: false });
      expect(await callApi()).toEqual({ output: output(3), cached: true });
    });
    expect(subscribe).toHaveBeenCalledTimes(3);
  });
});
