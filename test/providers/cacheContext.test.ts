import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, withCacheNamespace } from '../../src/cache';
import { AI21ChatCompletionProvider } from '../../src/providers/ai21';
import { CohereChatCompletionProvider } from '../../src/providers/cohere';
import { LocalAiChatProvider, LocalAiCompletionProvider } from '../../src/providers/localai';
import { fetchWithRetries } from '../../src/util/fetch/index';

import type { ApiProvider, CallApiContextParams } from '../../src/types/providers';

vi.mock('../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/fetch/index')>()),
  fetchWithRetries: vi.fn(),
}));

const prompt = 'Test prompt';
const context: CallApiContextParams = { prompt: { raw: prompt, label: prompt }, vars: {} };
const namespace = 'provider-cache-context';

describe.each([
  {
    name: 'AI21',
    createProvider: () =>
      new AI21ChatCompletionProvider('jamba-mini', { config: { apiKey: 'test-key' } }),
    responseBody: (output: string) => ({ choices: [{ message: { content: output } }] }),
  },
  {
    name: 'Cohere',
    createProvider: () =>
      new CohereChatCompletionProvider('command-r', { config: { apiKey: 'test-key' } }),
    responseBody: (output: string) => ({ text: output }),
  },
  {
    name: 'LocalAI chat',
    createProvider: () => new LocalAiChatProvider('test-model'),
    responseBody: (output: string) => ({ choices: [{ message: { content: output } }] }),
  },
  {
    name: 'LocalAI completion',
    createProvider: () => new LocalAiCompletionProvider('test-model'),
    responseBody: (output: string) => ({ choices: [{ text: output }] }),
  },
])('$name cache context', ({ createProvider, responseBody }) => {
  let provider: ApiProvider;
  const callApi = (callContext?: CallApiContextParams) =>
    withCacheNamespace(namespace, () => provider.callApi(prompt, callContext));

  beforeEach(() => {
    vi.resetAllMocks();
    provider = createProvider();
    vi.mocked(fetchWithRetries).mockImplementation(async () =>
      Response.json(responseBody(`response ${vi.mocked(fetchWithRetries).mock.calls.length}`)),
    );
  });

  afterEach(async () => {
    // The shared test setup uses memory storage; clear only this suite's namespace.
    await withCacheNamespace(namespace, () => getCache().clear());
    vi.resetAllMocks();
  });

  it.each([
    { name: 'no context', flags: undefined, bypass: false },
    { name: 'no cache flags', flags: {}, bypass: false },
    { name: 'bustCache', flags: { bustCache: true }, bypass: true },
    { name: 'debug', flags: { debug: true }, bypass: true },
    { name: 'debug false', flags: { debug: false }, bypass: false },
    {
      name: 'bustCache false overrides debug true',
      flags: { bustCache: false, debug: true },
      bypass: false,
    },
    {
      name: 'bustCache true overrides debug false',
      flags: { bustCache: true, debug: false },
      bypass: true,
    },
  ])('honors $name without replacing the cached response', async ({ flags, bypass }) => {
    expect(await callApi()).toMatchObject({ output: 'response 1' });
    expect(await callApi(flags ? { ...context, ...flags } : undefined)).toMatchObject({
      output: bypass ? 'response 2' : 'response 1',
    });
    expect(await callApi()).toMatchObject({ output: 'response 1' });
    expect(fetchWithRetries).toHaveBeenCalledTimes(bypass ? 2 : 1);
  });

  it.each([{ bustCache: true }, { debug: true }])(
    'returns network errors when bypassing with %j instead of using stale cache',
    async (flags) => {
      expect(await callApi()).toMatchObject({ output: 'response 1' });
      vi.mocked(fetchWithRetries).mockRejectedValueOnce(new Error('unavailable'));

      expect(await callApi({ ...context, ...flags })).toEqual({
        error: 'API call error: Error: unavailable',
      });
      expect(await callApi()).toMatchObject({ output: 'response 1' });
      expect(fetchWithRetries).toHaveBeenCalledTimes(2);
    },
  );
});
