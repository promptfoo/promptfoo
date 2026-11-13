import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { CohereChatCompletionProvider } from '../../src/providers/cohere';

vi.mock('../../src/cache', () => ({ fetchWithCache: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const cases = [
  {
    name: 'current raw tokens',
    fields: {
      meta: {
        tokens: { input_tokens: 71, output_tokens: 198 },
        billed_units: { input_tokens: 5, output_tokens: 198 },
      },
    },
    prompt: 71,
    completion: 198,
    total: 269,
  },
  {
    name: 'current billed fallback',
    fields: { meta: { billed_units: { input_tokens: 5, output_tokens: 198 } } },
    prompt: 5,
    completion: 198,
    total: 203,
  },
  {
    name: 'legacy custom endpoint',
    fields: { token_count: { prompt_tokens: 5, response_tokens: 2, total_tokens: 10 } },
    prompt: 5,
    completion: 2,
    total: 10,
  },
  {
    name: 'legacy precedence over current metadata',
    fields: {
      token_count: { prompt_tokens: 5, response_tokens: 2, total_tokens: 10 },
      meta: { tokens: { input_tokens: 71, output_tokens: 198 } },
    },
    prompt: 5,
    completion: 2,
    total: 10,
  },
  {
    name: 'zero raw tokens do not use billed values',
    fields: {
      meta: {
        tokens: { input_tokens: 0, output_tokens: 0 },
        billed_units: { input_tokens: 5, output_tokens: 198 },
      },
    },
    prompt: 0,
    completion: 0,
    total: 0,
  },
  {
    name: 'partial raw tokens do not mix with billed values',
    fields: {
      meta: { tokens: { input_tokens: 3 }, billed_units: { input_tokens: 5, output_tokens: 198 } },
    },
    prompt: 3,
    completion: 0,
    total: 3,
  },
  {
    name: 'empty raw tokens do not use billed values',
    fields: { meta: { tokens: {}, billed_units: { input_tokens: 5, output_tokens: 198 } } },
    prompt: 0,
    completion: 0,
    total: 0,
  },
  {
    name: 'null raw tokens use billed values',
    fields: { meta: { tokens: null, billed_units: { input_tokens: 5, output_tokens: 2 } } },
    prompt: 5,
    completion: 2,
    total: 7,
  },
  {
    name: 'empty legacy usage remains authoritative',
    fields: { token_count: {}, meta: { tokens: { input_tokens: 5, output_tokens: 2 } } },
    prompt: 0,
    completion: 0,
    total: 0,
  },
  {
    name: 'null legacy usage uses metadata',
    fields: { token_count: null, meta: { tokens: { input_tokens: 5, output_tokens: 2 } } },
    prompt: 5,
    completion: 2,
    total: 7,
  },
  { name: 'null metadata', fields: { meta: null }, prompt: 0, completion: 0, total: 0 },
  { name: 'missing usage', fields: {}, prompt: 0, completion: 0, total: 0 },
];

describe('Cohere v1 response usage contract', () => {
  it.each(cases.flatMap((scenario) => [false, true].map((cached) => ({ ...scenario, cached }))))(
    '$name (cached: $cached)',
    async ({ fields, prompt, completion, total, cached }) => {
      const data = { text: 'answer', ...fields };
      const original = structuredClone(data);
      vi.mocked(fetchWithCache).mockResolvedValue({ data, cached, status: 200 } as any);
      const provider = new CohereChatCompletionProvider('command-a-03-2025', {
        config: { apiKey: 'fixture-only' },
      });
      const response = await provider.callApi('hello');
      expect(response).toEqual({
        output: 'answer',
        cached,
        tokenUsage: { prompt, completion, total, cached: cached ? total : 0, numRequests: 1 },
      });
      expect(data).toEqual(original);
      expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe('https://api.cohere.ai/v1/chat');
      expect(vi.mocked(fetchWithCache).mock.calls[0][4]).toBe(true);
    },
  );
});
