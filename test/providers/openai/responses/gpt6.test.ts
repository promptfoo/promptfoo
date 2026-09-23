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
    'does not use direct OpenAI pricing for generic Responses configured with an Azure endpoint for %s',
    async (model) => {
      const data = {
        ...responseData,
        model,
        usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 },
      };
      for (const apiBaseUrl of [
        'https://resource.openai.azure.com/openai/v1',
        'https://resource.services.ai.azure.com/openai/v1',
        'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
      ]) {
        for (const [rates, expected] of [
          [{}, undefined],
          [{ inputCost: 2 / 1e6 }, undefined],
          [{ inputCost: 2 / 1e6, outputCost: 3 / 1e6 }, 0.0023],
        ] as const) {
          for (const deployment of [model, `prod-${model}`]) {
            vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
              data: { ...data, model: deployment },
              cached: false,
              status: 200,
              statusText: 'OK',
            });
            const result = await new OpenAiResponsesProvider(deployment, {
              config: { apiKey: 'test-key', apiBaseUrl, ...rates },
            }).callApi('A test prompt');
            expect(result.error).toBeUndefined();
            if (expected === undefined) {
              expect(result.cost).toBeUndefined();
            } else {
              expect(result.cost).toBeCloseTo(expected, 10);
            }
          }
        }
      }
    },
  );

  it.each(['gpt-6-sol', 'gpt-6-luna'])(
    'leaves Azure hosted-tool totals unknown instead of adding direct OpenAI fees for %s',
    async (model) => {
      const rates = { inputCost: 0.0002, outputCost: 0.001 };
      const webItem = { type: 'web_search_call', status: 'completed', action: { type: 'search' } };
      const fileItem = { type: 'file_search_call', status: 'completed' };
      const interpreterItem = {
        type: 'code_interpreter_call',
        status: 'completed',
        container_id: 'container',
      };
      const imageItem = { type: 'image_generation_call', status: 'completed' };
      const payload = (items: unknown[], toolUsage?: unknown) => ({
        ...responseData,
        model,
        output: [...items, ...responseData.output],
        usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 },
        ...(toolUsage === undefined ? {} : { tool_usage: toolUsage }),
      });
      for (const apiBaseUrl of [
        'https://resource.openai.azure.com/openai/v1',
        'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
      ]) {
        const provider = new OpenAiResponsesProvider(model, {
          config: { apiKey: 'test-key', apiBaseUrl, ...rates },
        });
        for (const [items, toolUsage, cached, expected] of [
          [[webItem], { web_search: { num_requests: 1 } }, false, undefined],
          [[webItem], { web_search: { num_requests: 5 } }, false, undefined],
          [[], { web_search: { num_requests: 5 } }, false, undefined],
          [[webItem], undefined, false, undefined],
          [[fileItem], undefined, false, undefined],
          [[interpreterItem], undefined, false, undefined],
          [[imageItem], undefined, false, undefined],
          [[interpreterItem], { web_search: { num_requests: 0 } }, false, undefined],
          [[interpreterItem], undefined, true, 0],
          [[webItem], { web_search: { num_requests: 0 } }, false, 0.3],
          [[], undefined, false, 0.3],
          [[webItem], { web_search: { num_requests: 5 } }, true, 0],
        ] as const) {
          vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
            data: payload([...items], toolUsage),
            cached,
            status: 200,
            statusText: 'OK',
          });
          const result = await provider.callApi('A test prompt');
          expect(result.error).toBeUndefined();
          if (expected === undefined) {
            expect(result.cost).toBeUndefined();
          } else {
            expect(result.cost).toBeCloseTo(expected, 10);
          }
        }
      }
      for (const [item, expected] of [
        [webItem, 0.31],
        [fileItem, 0.3025],
      ] as const) {
        vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
          data: payload([item]),
          cached: false,
          status: 200,
          statusText: 'OK',
        });
        const native = await new OpenAiResponsesProvider(model, {
          config: { apiKey: 'test-key', ...rates },
        }).callApi('A test prompt');
        expect(native.cost).toBeCloseTo(expected, 10);
      }
    },
  );

  it.each(['gpt-6-sol', 'gpt-6-luna'])(
    'normalizes marked OpenRouter refusals and preserves native policy errors for %s',
    async (model) => {
      const message = 'The model provider declined the request.';
      for (const code of ['bio_policy', 'cyber_policy']) {
        for (const entry of [
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
              output: [],
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

        vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
          cached: false,
          status: 403,
          statusText: 'Forbidden',
          data: { error: { code, message } },
        });
        const native = await new OpenAiResponsesProvider(model, {
          config: { apiKey: 'test-key' },
        }).callApi('A benign prompt');
        expect(native.error).toContain(code);
        expect(native.isRefusal).toBeUndefined();
        expect(native.guardrails).toBeUndefined();
      }

      for (const gateway of [false, true]) {
        const revocation = 'Access for your organization has been temporarily revoked.';
        vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
          cached: false,
          status: 403,
          statusText: 'Forbidden',
          data: { error: { code: 'cyber_policy', message: revocation, error_type: 'refusal' } },
        });
        const provider = new OpenAiResponsesProvider(gateway ? `openai/${model}` : model, {
          config: {
            apiKey: 'test-key',
            ...(gateway ? { apiBaseUrl: 'https://openrouter.ai/api/v1' } : {}),
          },
        });
        const result = await provider.callApi('A benign prompt');
        expect(result.error).toContain(revocation);
        expect(result.isRefusal).toBeUndefined();
        expect(result.guardrails).toBeUndefined();
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
    'preserves the raw OpenRouter Responses refusal, usage, and response metadata for %s',
    async (model) => {
      const data = {
        id: `resp_policy_${model}`,
        model: `openai/${model}`,
        status: 'failed',
        error_type: 'refusal',
        error: { code: 'bio_policy', message: 'The provider declined this request.' },
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150, cost: 0.004 },
      };
      for (const [stream, upstream] of [
        [false, data],
        [true, `data: ${JSON.stringify({ type: 'response.failed', response: data })}\n\n`],
      ] as const) {
        vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
          cached: false,
          status: 200,
          statusText: 'OK',
          data: upstream,
        });
        const result = await new OpenAiResponsesProvider(`openai/${model}`, {
          config: { apiKey: 'test-key', apiBaseUrl: 'https://openrouter.ai/api/v1', stream },
        }).callApi('A test prompt');
        expect(result).toMatchObject({
          isRefusal: true,
          raw: data,
          tokenUsage: { prompt: 100, completion: 50, total: 150, numRequests: 1 },
          cost: 0.004,
          metadata: {
            responseId: data.id,
            model: data.model,
            providerPolicy: { code: 'bio_policy' },
          },
        });
      }

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        cached: true,
        status: 200,
        statusText: 'OK',
        data,
      });
      const cached = await new OpenAiResponsesProvider(`openai/${model}`, {
        config: { apiKey: 'test-key', apiBaseUrl: 'https://openrouter.ai/api/v1' },
      }).callApi('A test prompt');
      expect(cached.tokenUsage).toMatchObject({ cached: 150, total: 150 });
    },
  );

  it.each(['gpt-6-sol', 'gpt-6-luna'])(
    'preserves partial OpenRouter Responses output and grades late content blocks for %s',
    async (model) => {
      const partial = 'Visible partial answer';
      const description = 'The provider stopped generation.';
      const output = [
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: partial }] },
      ];
      for (const marker of ['refusal', 'content_policy_violation']) {
        const base = {
          id: 'resp_policy',
          status: 'failed',
          model: `openai/${model}`,
          error_type: marker,
          error: { code: 'cyber_policy', message: description },
        };
        const streamed = (delta: string, terminalText: string) =>
          `data: ${JSON.stringify({ type: 'response.output_text.delta', delta })}\n\ndata: ${JSON.stringify({ type: 'response.failed', response: { ...base, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: terminalText }] }] } })}\n\n`;
        const multiple = ['First', 'Second'].map((text) => ({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        }));
        const multipleStream = (terminalOutput: typeof multiple) =>
          [
            { type: 'response.output_text.delta', output_index: 1, content_index: 1, delta: 'ond' },
            { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'Fi' },
            { type: 'response.output_text.delta', output_index: 1, content_index: 0, delta: 'Sec' },
            { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'rst' },
            { type: 'response.failed', response: { ...base, output: terminalOutput } },
          ]
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join('');
        for (const [stream, raw, partialExpected] of [
          [false, { ...base, output }, partial],
          [
            true,
            `data: ${JSON.stringify({ type: 'response.failed', response: { ...base, output } })}\n\n`,
            partial,
          ],
          [
            true,
            `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Visible ' })}\n\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'partial answer' })}\n\ndata: ${JSON.stringify({ type: 'response.failed', response: { ...base, output: [] } })}\n\n`,
            partial,
          ],
          [true, streamed('Visible ', `${partial} and more`), `${partial} and more`],
          [true, streamed(partial, 'Visible '), partial],
          [true, streamed('Different delta text', partial), partial],
          [false, { ...base, output: multiple }, 'First\nSecond'],
          [true, multipleStream(multiple), 'First\nSecond'],
          [true, multipleStream([multiple[0]]), 'First\nSecond'],
          [true, multipleStream([]), 'First\nSecond'],
          [
            false,
            {
              ...base,
              output: [
                {
                  type: 'reasoning',
                  content: [{ type: 'output_text', text: 'Private reasoning' }],
                },
              ],
            },
            undefined,
          ],
        ] as const) {
          for (const apiBaseUrl of [
            'https://openrouter.ai/api/v1',
            'https://proxy.example.test/openrouter/api/v1',
          ]) {
            vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
              data: raw,
              cached: false,
              status: 200,
              statusText: 'OK',
            });
            const result = await new OpenAiResponsesProvider(`openai/${model}`, {
              config: { apiKey: 'test-key', apiBaseUrl, stream },
            }).callApi('A benign test prompt');
            expect(result.error).toBeUndefined();
            expect(result.output).toBe(partialExpected ?? description);
            expect(result.isRefusal).toBe(true);
            expect(result.guardrails?.flagged).toBe(true);
            expect(result.guardrails?.flaggedInput).toBe(
              !partialExpected && marker === 'refusal' ? true : undefined,
            );
            expect(result.raw).toMatchObject({ id: 'resp_policy', error_type: marker });
          }
        }
      }
    },
  );

  it.each(['gpt-6-sol', 'gpt-6-luna'])(
    'parses complete structured Responses refusal output and distinguishes gateway access errors for %s',
    async (model) => {
      const provider = new OpenAiResponsesProvider(`openai/${model}`, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://openrouter.ai/api/v1',
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'answer',
              strict: true,
              schema: {
                type: 'object',
                properties: { answer: { type: 'string' } },
                required: ['answer'],
                additionalProperties: false,
              },
            },
          },
        },
      });
      const resultFor = async (text: string | undefined, message: string) => {
        const data = {
          id: 'refusal',
          model,
          status: 'failed',
          error_type: 'refusal',
          error: { code: 'cyber_policy', message },
          output:
            text === undefined
              ? []
              : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
        };
        vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
          data,
          cached: false,
          status: 400,
          statusText: 'Bad Request',
        });
        return { result: await provider.callApi('A benign prompt'), data };
      };
      for (const [text, expected] of [
        ['{"answer":"visible"}', { answer: 'visible' }],
        ['{"answer":', '{"answer":'],
      ] as const) {
        const { result, data } = await resultFor(text, 'The provider declined the response.');
        expect(result.output).toEqual(expected);
        expect(result.isRefusal).toBe(true);
        expect(result.raw).toEqual(data);
      }
      for (const [message, expected] of [
        ['Your access to the requested private data is restricted; I cannot help obtain it.', true],
        ['I cannot assist with access if your account is suspended.', true],
        ['Access for this user has been temporarily revoked.', false],
        ['Error: Access for this safety identifier has been temporarily revoked.', false],
      ] as const) {
        const { result } = await resultFor(undefined, message);
        expect(result.isRefusal).toBe(expected ? true : undefined);
        if (expected) {
          expect(result.output).toBe(message);
          expect(result.error).toBeUndefined();
        } else {
          expect(result.error).toContain(message);
        }
      }
    },
  );

  it.each(['gpt-6-sol', 'gpt-6-luna'])(
    'retains gateway policy output after standalone Responses stream errors and preserves technical errors for %s',
    async (model) => {
      const partial = 'Visible partial answer';
      const message = 'The output was blocked.';
      const delta = {
        type: 'response.output_text.delta',
        output_index: 0,
        content_index: 0,
        delta: partial,
      };
      const terminal = (errorType: string, code: string) => ({
        type: 'response.failed',
        response: {
          id: 'stream-policy',
          status: 'failed',
          error_type: errorType,
          error: { code, message },
          output: [],
        },
      });
      const plain = (code: string, errorType?: string) => ({
        type: 'error',
        error: { code, message },
        ...(errorType ? { error_type: errorType } : {}),
      });
      const cases = [
        {
          events: [
            delta,
            plain('image_content_policy_violation'),
            terminal('content_policy_violation', 'image_content_policy_violation'),
          ],
          refusal: true,
        },
        {
          events: [
            delta,
            plain('cyber_policy'),
            terminal('content_policy_violation', 'cyber_policy'),
          ],
          refusal: true,
        },
        { events: [delta, plain('cyber_policy', 'content_policy_violation')], refusal: true },
        { events: [delta, plain('image_content_policy_violation')], refusal: true },
        { events: [delta, plain('cyber_policy')], refusal: false },
        {
          events: [
            delta,
            plain('provider_unavailable'),
            terminal('provider_unavailable', 'provider_unavailable'),
          ],
          refusal: false,
        },
        {
          events: [
            delta,
            plain('image_content_policy_violation'),
            terminal('provider_unavailable', 'provider_unavailable'),
          ],
          refusal: false,
        },
      ];
      for (const apiBaseUrl of [
        'https://openrouter.ai/api/v1',
        'https://proxy.example.test/openrouter/api/v1',
        'https://api.openai.com/v1',
      ]) {
        for (const { events, refusal } of cases) {
          const raw = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
          vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
            data: raw,
            cached: false,
            status: 200,
            statusText: 'OK',
          });
          const result = await new OpenAiResponsesProvider(model, {
            config: { apiKey: 'test-key', apiBaseUrl, stream: true },
          }).callApi('A benign test prompt');
          if (refusal && !apiBaseUrl.includes('api.openai.com')) {
            expect(result.error).toBeUndefined();
            expect(result.output).toBe(partial);
            expect(result.isRefusal).toBe(true);
            expect(result.guardrails?.flagged).toBe(true);
            expect(result.guardrails?.flaggedInput).toBeUndefined();
          } else {
            expect(result.error).toContain('streaming response error');
            expect(result.isRefusal).toBeUndefined();
            expect(result.output).toBeUndefined();
          }
        }
      }
    },
  );

  it.each(['gpt-6-sol', 'gpt-6-luna'])(
    'treats OpenRouter invalid_prompt request errors as errors unless explicitly marked as a refusal for %s',
    async (model) => {
      for (const errorType of [
        'context_length_exceeded',
        'invalid_request',
        undefined,
        'refusal',
      ]) {
        for (const apiBaseUrl of [
          'https://openrouter.ai/api/v1',
          'https://proxy.example.test/openrouter/api/v1',
        ]) {
          if (errorType === undefined && apiBaseUrl.includes('proxy.example')) {
            continue;
          }
          vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
            cached: false,
            status: 400,
            statusText: 'Bad Request',
            data: {
              error_type: errorType,
              error: { code: 'invalid_prompt', message: 'Request rejected by the gateway.' },
            },
          });
          const result = await new OpenAiResponsesProvider(`openai/${model}`, {
            config: { apiKey: 'test-key', apiBaseUrl },
          }).callApi('A benign prompt');
          if (errorType === 'refusal') {
            expect(result.isRefusal).toBe(true);
            expect(result.error).toBeUndefined();
          } else {
            expect(result.isRefusal).toBeUndefined();
            expect(result.guardrails).toBeUndefined();
            expect(result.error).toContain('invalid_prompt');
          }
        }
      }

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        cached: false,
        status: 400,
        statusText: 'Bad Request',
        data: { error: { code: 'invalid_prompt', message: 'The native provider declined.' } },
      });
      const native = await new OpenAiResponsesProvider(model, {
        config: { apiKey: 'test-key' },
      }).callApi('A test prompt');
      expect(native.isRefusal).toBe(true);
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

  it.each([
    ['gpt-6-sol', 0.012, 0.0132],
    ['gpt-6-luna', 0.0006, 0.00066],
  ] as const)(
    'distinguishes global and U.S. Bedrock Runtime pricing for %s',
    async (model, globalCost, usCost) => {
      const usage = { input_tokens: 1_000, output_tokens: 1_000, total_tokens: 2_000 };
      for (const [profile, expected] of [
        ['global', globalCost],
        ['us', usCost],
      ] as const) {
        for (const override of [false, true]) {
          const wireModel = `${profile}.openai.${model}`;
          vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
            cached: false,
            status: 200,
            statusText: 'OK',
            data: { ...responseData, model: wireModel, usage },
          });
          const provider = new OpenAiResponsesProvider(override ? 'gpt-4.1' : wireModel, {
            config: {
              apiKey: 'test-key',
              apiBaseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
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
                    config: { passthrough: { model: wireModel } },
                  },
                }
              : undefined,
          );
          expect(result.error).toBeUndefined();
          expect(result.cost).toBeCloseTo(expected, 10);
        }

        vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
          cached: false,
          status: 200,
          statusText: 'OK',
          data: { ...responseData, model: `${profile}.openai.${model}`, usage },
        });
        const estimated = await new OpenAiResponsesProvider(`${profile}.openai.${model}`, {
          config: {
            apiKey: 'test-key',
            apiBaseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
            inputCost: 0.0002,
            outputCost: 0.0003,
          },
        }).callApi('Say ready.');
        expect(estimated.cost).toBeCloseTo(0.5, 10);
      }

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        cached: false,
        status: 200,
        statusText: 'OK',
        data: { ...responseData, model: `us-gov.openai.${model}`, usage },
      });
      const government = await new OpenAiResponsesProvider(`us-gov.openai.${model}`, {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://bedrock-runtime.us-gov-west-1.amazonaws.com/openai/v1',
        },
      }).callApi('Say ready.');
      expect(government.cost).toBeUndefined();
    },
  );

  it.each([
    ['gpt-6-sol', 0.012, 0.0132],
    ['gpt-6-luna', 0.0006, 0.00066],
  ] as const)(
    'uses Bedrock Runtime rates across dual-stack and FIPS hosts for %s',
    async (model, global, us) => {
      const usage = { input_tokens: 1_000, output_tokens: 1_000, total_tokens: 2_000 };
      for (const hostname of [
        'bedrock-runtime.us-east-1.api.aws',
        'bedrock-runtime-fips.us-east-1.amazonaws.com',
        'bedrock-runtime-fips.us-east-1.api.aws',
      ]) {
        for (const [profile, expected] of [
          ['global', global],
          ['us', us],
        ] as const) {
          const wireModel = `${profile}.openai.${model}`;
          vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
            cached: false,
            status: 200,
            statusText: 'OK',
            data: { ...responseData, model: wireModel, usage },
          });
          const result = await new OpenAiResponsesProvider(wireModel, {
            config: { apiKey: 'test-key', apiBaseUrl: `https://${hostname}/openai/v1` },
          }).callApi('Say ready.');
          expect(result.error).toBeUndefined();
          expect(result.cost).toBeCloseTo(expected, 10);
        }
      }
    },
  );
});
