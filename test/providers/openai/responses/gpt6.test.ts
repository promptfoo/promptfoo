// Register the shared Responses HTTP mocks before importing the provider.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { BedrockOpenAiResponsesProvider } from '../../../../src/providers/bedrock/openaiResponses';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

const responseData = {
  id: 'resp_astra',
  model: 'gpt-6-astra',
  status: 'completed',
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
};

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
          ...responseData,
          model: requestModel,
          service_tier: 'fast',
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

  it.each([
    { configured: null, passthrough: 'flex', reported: undefined, cost: 0.0330625 },
    { configured: 'fast', passthrough: 'flex', reported: undefined, cost: 0.0330625 },
    { configured: 'flex', passthrough: 'fast', reported: undefined, cost: 0.13225 },
    { configured: 'fast', passthrough: null, reported: undefined, cost: 0.066125 },
    { configured: 'fast', passthrough: 'flex', reported: 'default', cost: 0.066125 },
  ] as const)(
    'bills $cost with configured=$configured, passthrough=$passthrough, reported=$reported',
    async ({ configured, passthrough, reported, cost }) => {
      vi.mocked(cache.fetchWithCache).mockResolvedValue({
        cached: false,
        status: 200,
        statusText: 'OK',
        data: { ...responseData, service_tier: reported },
      });
      const provider = new OpenAiResponsesProvider('gpt-6-astra', {
        config: {
          apiKey: 'test-key',
          service_tier: configured,
          passthrough: { service_tier: passthrough },
        },
      });
      const result = await provider.callApi('Summarize the job.');

      const [, options] = vi.mocked(cache.fetchWithCache).mock.calls[0];
      expect(JSON.parse(options?.body as string).service_tier).toBe(passthrough);
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeCloseTo(cost, 10);
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

describe('GPT-6 Sol and Luna Responses billing', () => {
  it.each(['gpt-6-sol', 'gpt-6-luna'])(
    'normalizes upstream policy refusals on native and OpenRouter Responses for %s',
    async (model) => {
      const message = 'The model provider declined the request.';
      for (const code of ['bio_policy', 'cyber_policy']) {
        for (const entry of [
          { gateway: false, status: 403, data: { error: { code, message } } },
          {
            gateway: true,
            status: 403,
            data: {
              type: 'response.failed',
              response: { error_type: 'refusal', error: { code, message } },
            },
          },
          {
            gateway: true,
            status: 200,
            data: {
              ...responseData,
              status: 'failed',
              error_type: 'refusal',
              error: { code, message },
            },
          },
        ]) {
          vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
            cached: false,
            status: entry.status,
            statusText: entry.status === 403 ? 'Forbidden' : 'OK',
            headers: { 'x-request-id': 'test' },
            data: entry.data,
          });
          const provider = new OpenAiResponsesProvider(entry.gateway ? `openai/${model}` : model, {
            config: {
              apiKey: 'test-key',
              ...(entry.gateway ? { apiBaseUrl: 'https://openrouter.ai/api/v1' } : {}),
            },
          });
          const result = await provider.callApi('A test prompt');
          expect(result.error).toBeUndefined();
          expect(result).toMatchObject({
            output: message,
            isRefusal: true,
            guardrails: { flagged: true, flaggedInput: true, reason: message },
            metadata: {
              providerPolicy: { code },
              http: { status: entry.status, headers: { 'x-request-id': 'test' } },
            },
          });
        }
      }
      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        cached: false,
        status: 403,
        statusText: 'Forbidden',
        data: {
          error: { code: 'invalid_api_key', message: 'Unauthorized', error_type: 'authentication' },
        },
      });
      const denied = await new OpenAiResponsesProvider(`openai/${model}`, {
        config: { apiKey: 'test-key', apiBaseUrl: 'https://openrouter.ai/api/v1' },
      }).callApi('A test prompt');
      expect(denied.error).toContain('Unauthorized');
      expect(denied.isRefusal).toBeUndefined();
    },
  );

  it.each(['gpt-6-sol', 'gpt-6-luna'])(
    'uses reported OpenRouter Responses billing and preserves BYOK uncertainty for %s',
    async (model) => {
      const counts = { input_tokens: 1_000, output_tokens: 100, total_tokens: 1_100 };
      for (const { usage, config, cached, expected } of [
        {
          usage: { ...counts, cost: 0.075, is_byok: false },
          config: {},
          cached: false,
          expected: 0.075,
        },
        { usage: { ...counts, cost: 0 }, config: {}, cached: false, expected: 0 },
        { usage: { ...counts, cost: 0.075 }, config: {}, cached: true, expected: 0.075 },
        {
          usage: { ...counts, cost: 0.075, is_byok: true },
          config: {},
          cached: false,
          expected: undefined,
        },
        { usage: counts, config: {}, cached: false, expected: undefined },
        {
          usage: { ...counts, prompt_tokens: 1, completion_tokens: 1, cost: 0.075, is_byok: true },
          config: { inputCost: 0.001, outputCost: 0.002 },
          cached: false,
          expected: 1.2,
        },
        {
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30, cost: 0.075 },
          config: { inputCost: 0.01, outputCost: 0.02 },
          cached: false,
          expected: 0.4,
        },
        {
          usage: { ...counts, cost: 0.075 },
          config: { inputCost: 0.01 },
          cached: false,
          expected: undefined,
        },
      ]) {
        vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
          cached,
          status: 200,
          statusText: 'OK',
          data: {
            ...responseData,
            model: `openai/${model}`,
            output: [
              { type: 'web_search_call', id: 'web_1', status: 'completed' },
              ...responseData.output,
            ],
            usage: { ...usage, cost_details: { upstream_inference_cost: 0.02 } },
          },
        });
        const result = await new OpenAiResponsesProvider(`openai/${model}`, {
          config: { apiKey: 'test-key', apiBaseUrl: 'https://openrouter.ai/api/v1', ...config },
        }).callApi('Say ready.');
        expect(result.error).toBeUndefined();
        expect(result.output).toContain('Ready.');
        expect(result.cost).toBe(expected);
        expect(result.metadata).toMatchObject({
          responseId: 'resp_astra',
          openrouter: {
            ...('cost' in usage ? { accountCharge: usage.cost } : {}),
            ...('is_byok' in usage ? { isByok: usage.is_byok } : {}),
            reportedUpstreamInferenceCost: 0.02,
          },
        });
      }
    },
  );

  it.each([
    ['gpt-6-sol', 0.013225],
    ['gpt-6-luna', 0.00066125],
  ])('returns token usage and the standard estimated cost for %s', async (model, cost) => {
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      data: { ...responseData, model },
    });
    const result = await new OpenAiResponsesProvider(model, {
      config: { apiKey: 'test-key', reasoning: { effort: 'none' } },
    }).callApi('Say ready.');

    const [, options] = vi.mocked(cache.fetchWithCache).mock.calls[0];
    expect(JSON.parse(options?.body as string)).toMatchObject({
      model,
      reasoning: { effort: 'none' },
    });
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Ready.');
    expect(result.tokenUsage).toMatchObject({
      prompt: 2000,
      completion: 1000,
      completionDetails: { cacheReadInputTokens: 500, cacheCreationInputTokens: 250 },
    });
    expect(result.cost).toBeCloseTo(cost, 10);
  });

  it.each([
    { model: 'gpt-6-sol', cost: 0.0145475, override: false },
    { model: 'gpt-6-luna', cost: 0.000727375, override: false },
    { model: 'gpt-6-sol', cost: 0.0145475, override: true },
    { model: 'gpt-6-luna', cost: 0.000727375, override: true },
  ])(
    'estimates published regional Bedrock prices for $model (prompt override: $override)',
    async ({ model, cost, override }) => {
      vi.mocked(cache.fetchWithCache).mockResolvedValue({
        cached: false,
        status: 200,
        statusText: 'OK',
        data: { ...responseData, model },
      });
      const bedrockModel = `openai.${model}`;
      const provider = new BedrockOpenAiResponsesProvider(
        override ? 'openai.gpt-5.6-terra' : bedrockModel,
        { config: { apiKey: 'test-key', region: 'us-east-1' } },
      );
      const result = await provider.callApi(
        'Say ready.',
        override
          ? {
              vars: {},
              prompt: {
                raw: 'Say ready.',
                label: 'ready',
                config: { passthrough: { model: bedrockModel } },
              },
            }
          : undefined,
      );

      const [url, options] = vi.mocked(cache.fetchWithCache).mock.calls[0];
      expect(url).toBe('https://bedrock-mantle.us-east-1.api.aws/openai/v1/responses');
      expect(JSON.parse(options?.body as string)).toMatchObject({ model: bedrockModel });
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Ready.');
      expect(result.cost).toBeCloseTo(cost, 10);
    },
  );

  it.each([
    ['gpt-6-sol', 0.0145475],
    ['gpt-6-luna', 0.000727375],
  ])(
    'uses regional rates on a generic provider aimed at Bedrock Mantle for %s',
    async (model, cost) => {
      for (const override of [false, true]) {
        vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
          cached: false,
          status: 200,
          statusText: 'OK',
          data: { ...responseData, model: `openai.${model}` },
        });
        const provider = new OpenAiResponsesProvider(override ? 'gpt-4.1' : `openai.${model}`, {
          config: {
            apiKey: 'test-key',
            apiBaseUrl: 'https://bedrock-mantle.us-east-1.api.aws/openai/v1',
          },
        });
        const result = await provider.callApi(
          'Say ready.',
          override
            ? {
                vars: {},
                prompt: {
                  raw: 'Say ready.',
                  label: 'ready',
                  config: { passthrough: { model: `openai.${model}` } },
                },
              }
            : undefined,
        );
        expect(result.error).toBeUndefined();
        expect(result.cost).toBeCloseTo(cost, 10);
      }

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        cached: false,
        status: 200,
        statusText: 'OK',
        data: { ...responseData, model: `openai.${model}` },
      });
      const lookalike = await new OpenAiResponsesProvider(`openai.${model}`, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://bedrock-mantle.us-east-1.api.aws.example/openai/v1',
        },
      }).callApi('Say ready.');
      expect(lookalike.cost).toBeUndefined();
    },
  );
});
