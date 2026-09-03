// Register the shared Responses HTTP mocks before importing the provider.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('GPT-6 Astra Responses billing', () => {
  it.each(['gpt-6-astra', 'gpt-4.1'])(
    'sends Fast mode and bills the effective Astra model when configured as %s',
    async (model) => {
      vi.mocked(cache.fetchWithCache).mockResolvedValue({
        cached: false,
        status: 200,
        statusText: 'OK',
        data: {
          id: 'resp_astra',
          model: 'gpt-6-astra',
          status: 'completed',
          service_tier: 'fast',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Ready.' }],
            },
          ],
          usage: {
            input_tokens: 2000,
            output_tokens: 1000,
            total_tokens: 3000,
            input_tokens_details: { cached_tokens: 500, cache_write_tokens: 250 },
          },
        },
      });

      const provider = new OpenAiResponsesProvider(model, {
        config: {
          apiKey: 'test-key',
          service_tier: 'fast',
          reasoning_effort: 'max',
          ...(model === 'gpt-6-astra' ? {} : { passthrough: { model: 'gpt-6-astra' } }),
        },
      });
      const result = await provider.callApi('Summarize the job.');

      const [, options] = vi.mocked(cache.fetchWithCache).mock.calls[0];
      expect(JSON.parse(options?.body as string)).toMatchObject({
        model: 'gpt-6-astra',
        service_tier: 'fast',
        reasoning: { effort: 'max' },
      });
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Ready.');
      expect(result.cost).toBeCloseTo(0.13225, 10);
    },
  );
});
