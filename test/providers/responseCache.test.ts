import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { DMREmbeddingProvider } from '../../src/providers/docker';
import {
  OllamaChatProvider,
  OllamaCompletionProvider,
  OllamaEmbeddingProvider,
} from '../../src/providers/ollama';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { shouldBustProviderCache, withResponseCacheMetadata } from '../../src/providers/shared';
import { TrueFoundryEmbeddingProvider } from '../../src/providers/truefoundry';

import type { CallApiContextParams } from '../../src/types/index';

vi.mock('../../src/cache');

beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('response-cache metadata', () => {
  it('retains reported usage and cost without mutating the stored response', () => {
    const response = Object.freeze({
      output: 'stored output',
      cost: 0.25,
      tokenUsage: Object.freeze({
        total: 12,
        prompt: 10,
        completion: 2,
        cached: 4,
        numRequests: 1,
      }),
    });
    expect(withResponseCacheMetadata(response, true)).toEqual({
      ...response,
      cached: true,
      tokenUsage: { ...response.tokenUsage, cached: 12, numRequests: 0 },
    });
    expect(response.tokenUsage.cached).toBe(4);
    expect(response.tokenUsage.numRequests).toBe(1);
  });

  it('keeps vendor prompt caching separate from a response-cache hit', () => {
    const response = {
      output: 'live output',
      tokenUsage: { total: 12, cached: 4, numRequests: 1 },
    };
    expect(withResponseCacheMetadata(response, false)).toEqual({ ...response, cached: false });
  });

  it('preserves absent usage and cost instead of inventing zero counts', () => {
    expect(withResponseCacheMetadata({ output: 'unknown usage' }, true)).toEqual({
      output: 'unknown usage',
      cached: true,
    });
    expect(
      withResponseCacheMetadata({ output: 'partial usage', tokenUsage: { prompt: 5 } }, true),
    ).toEqual({ output: 'partial usage', cached: true, tokenUsage: { prompt: 5, numRequests: 0 } });
  });

  it('preserves known zero usage on replay', () => {
    expect(
      withResponseCacheMetadata({ output: '', tokenUsage: { total: 0 } }, true).tokenUsage,
    ).toEqual({ total: 0, cached: 0, numRequests: 0 });
  });
});

describe('response-cache policy', () => {
  it.each([
    [undefined, false],
    [{ debug: true }, true],
    [{ bustCache: true }, true],
    [{ bustCache: false, debug: true }, false],
    [{ bustCache: true, debug: false }, true],
  ] as const)('normalizes %j to %s', (context, expected) => {
    expect(shouldBustProviderCache(context)).toBe(expected);
  });
});

const prompt = { raw: 'fixture', label: 'fixture' };
const cases = [
  {
    name: 'OpenAI embedding',
    call: (context?: CallApiContextParams) =>
      new OpenAiEmbeddingProvider('text-embedding-3-small', {
        config: { apiKey: 'fixture-key' },
      }).callEmbeddingApi('fixture', context),
    data: { data: [{ embedding: [0.1, 0.2] }], usage: { total_tokens: 12, prompt_tokens: 12 } },
  },
  {
    name: 'Ollama chat',
    call: (context?: CallApiContextParams) =>
      new OllamaChatProvider('fixture').callApi('fixture', context),
    data: JSON.stringify({
      message: { content: 'output' },
      done: true,
      prompt_eval_count: 10,
      eval_count: 2,
    }),
  },
  {
    name: 'Ollama completion',
    call: (context?: CallApiContextParams) =>
      new OllamaCompletionProvider('fixture').callApi('fixture', context),
    data: JSON.stringify({ response: 'output', done: true, prompt_eval_count: 10, eval_count: 2 }),
  },
  {
    name: 'Ollama embedding',
    call: (context?: CallApiContextParams) =>
      new OllamaEmbeddingProvider('fixture').callEmbeddingApi('fixture', context),
    data: { embedding: [0.1, 0.2] },
  },
];

describe.each(cases)('$name cache contract', ({ call, data, name }) => {
  it.each([false, true])('reports cache provenance when cached=%s', async (cached) => {
    vi.mocked(fetchWithCache).mockResolvedValue({ data, cached, status: 200, statusText: 'OK' });
    const response = await call();
    expect(response.error).toBeUndefined();
    expect(response.cached).toBe(cached);
    if (cached && name !== 'Ollama embedding') {
      expect(response.tokenUsage).toMatchObject({ total: 12, cached: 12, numRequests: 0 });
    }
    if (name === 'Ollama embedding') {
      expect(response.tokenUsage).toBeUndefined();
    }
  });

  it.each([{ bustCache: true }, { debug: true }, { bustCache: false, debug: true }])(
    'forwards cache policy %j to the transport',
    async (cacheOptions) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data,
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const response = await call({ prompt, vars: {}, ...cacheOptions });
      expect(response.error).toBeUndefined();
      expect(vi.mocked(fetchWithCache).mock.calls[0][4]).toBe(
        shouldBustProviderCache(cacheOptions),
      );
    },
  );
});

describe.each([TrueFoundryEmbeddingProvider, DMREmbeddingProvider])(
  '%s embedding forwarding',
  (Provider) => {
    it.each([{ bustCache: true }, { debug: true }, { bustCache: false, debug: true }])(
      'preserves cache context %j and cancellation options',
      async (cacheOptions) => {
        vi.mocked(fetchWithCache).mockImplementation(async (url) => ({
          data: String(url).endsWith('/models')
            ? { data: [{ id: 'fixture' }] }
            : { data: [{ embedding: [0.1, 0.2] }], usage: { total_tokens: 12 } },
          cached: false,
          status: 200,
          statusText: 'OK',
        }));
        const provider = new Provider('fixture', { config: { apiKey: 'fixture-key' } });
        const controller = new AbortController();
        const result = await provider.callEmbeddingApi(
          'fixture',
          { prompt, vars: {}, ...cacheOptions },
          { abortSignal: controller.signal },
        );
        expect(result.error).toBeUndefined();
        const call = vi
          .mocked(fetchWithCache)
          .mock.calls.find(([url]) => String(url).endsWith('/embeddings'))!;
        expect(call[4]).toBe(shouldBustProviderCache(cacheOptions));
        expect(call[1]?.signal).toBe(controller.signal);
      },
    );
  },
);
