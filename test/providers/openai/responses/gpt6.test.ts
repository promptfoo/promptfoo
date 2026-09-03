// Register the shared Responses HTTP mocks before importing the provider.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('GPT-6 Astra Responses billing', () => {
  it.each([
    { model: 'gpt-6-astra', requestModel: 'gpt-6-astra' },
    { model: 'gpt-4.1', requestModel: 'gpt-6-astra' },
    { model: 'gpt-4.1', requestModel: 'openai/gpt-6-astra' },
  ])(
    'sends Fast mode and bills $requestModel when configured as $model',
    async ({ model, requestModel }) => {
      vi.mocked(cache.fetchWithCache).mockResolvedValue({
        cached: false,
        status: 200,
        statusText: 'OK',
        data: {
          id: 'resp_astra',
          model: requestModel,
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
          apiBaseUrl: 'https://gateway.example.test/v1',
          service_tier: 'fast',
          reasoning_effort: 'max',
          ...(model === requestModel ? {} : { passthrough: { model: requestModel } }),
        },
      });
      const result = await provider.callApi('Summarize the job.');

      const [, options] = vi.mocked(cache.fetchWithCache).mock.calls[0];
      expect(JSON.parse(options?.body as string)).toMatchObject({
        model: requestModel,
        service_tier: 'fast',
        reasoning: { effort: 'max' },
      });
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Ready.');
      expect(result.cost).toBeCloseTo(0.13225, 10);
    },
  );

  it('omits a null service tier while preserving explicit passthrough overrides', async () => {
    const provider = new OpenAiResponsesProvider('gpt-6-astra', {
      config: { service_tier: null },
    });
    const { body } = await provider.getOpenAiBody('Summarize the job.');
    expect(body).not.toHaveProperty('service_tier');

    const { body: overridden } = await provider.getOpenAiBody('Summarize the job.', {
      vars: {},
      prompt: {
        raw: 'Summarize the job.',
        label: 'summary',
        config: { passthrough: { service_tier: 'flex' } },
      },
    });
    expect(overridden.service_tier).toBe('flex');
  });
});
