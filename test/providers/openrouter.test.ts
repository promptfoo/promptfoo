import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, isCacheEnabled, withCacheEnabled } from '../../src/cache';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import { createProviderRateLimitOptions } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import * as fetchModule from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x) => x),
    renderVarsInObject: vi.fn((x) => x),
  };
});

vi.mock('../../src/util/fetch/index');

describe('OpenRouter', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    mockedFetchWithRetries.mockReset();
    vi.clearAllMocks();
  });

  describe('credential selection', () => {
    let restoreEnv: () => void;

    beforeEach(() => {
      restoreEnv = mockProcessEnv({
        OPENROUTER_API_KEY: 'process-router-key',
        CUSTOM_OPENROUTER_KEY: 'process-custom-key',
        OPENAI_API_KEY: 'unrelated-openai-key',
      });
      mockedFetchWithRetries.mockReset();
    });

    afterEach(() => {
      restoreEnv();
      mockedFetchWithRetries.mockReset();
    });

    it.each([
      [undefined, undefined, 'scoped-router-key'],
      ['CUSTOM_OPENROUTER_KEY', undefined, 'scoped-custom-key'],
      ['OPENAI_API_KEY', undefined, 'selected-openai-key'],
      ['CUSTOM_OPENROUTER_KEY', 'explicit-key', 'explicit-key'],
    ])('sends the selected credential (%s, %s)', async (apiKeyEnvar, apiKey, expectedKey) => {
      mockedFetchWithRetries.mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: 'Hello' } }], usage: { cost: 0.25 } }),
      );
      const provider = new OpenRouterProvider('fixture/model', {
        config: { apiKeyEnvar, apiKey, apiBaseUrl: 'https://proxy.example.com/v1' },
        env: {
          OPENROUTER_API_KEY: 'scoped-router-key',
          CUSTOM_OPENROUTER_KEY: 'scoped-custom-key',
          OPENAI_API_KEY: 'selected-openai-key',
        },
      });

      expect(await provider.callApi('Hello')).toMatchObject({ output: 'Hello', cost: 0.25 });
      expect(mockedFetchWithRetries).toHaveBeenCalledWith(
        'https://proxy.example.com/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${expectedKey}` }),
        }),
        expect.any(Number),
        undefined,
      );
    });

    it.each([undefined, 'CUSTOM_OPENROUTER_KEY'])(
      'leaves a missing selected credential unavailable (%s)',
      (apiKeyEnvar) => {
        mockProcessEnv({ OPENROUTER_API_KEY: undefined, CUSTOM_OPENROUTER_KEY: undefined });
        const provider = new OpenRouterProvider('fixture/model', {
          config: { apiKeyEnvar },
          env: {
            OPENAI_API_KEY: 'unrelated-scoped-openai-key',
            OPENROUTER_API_KEY: apiKeyEnvar ? 'nonselected-router-key' : undefined,
          },
        });
        expect(provider.getApiKey()).toBeUndefined();
      },
    );
  });

  describe('OpenRouterProvider', () => {
    const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});

    it('should initialize with correct model name', () => {
      expect(provider.modelName).toBe('google/gemini-2.5-pro');
    });

    it('should return correct id', () => {
      expect(provider.id()).toBe('openrouter:google/gemini-2.5-pro');
    });

    it('should return correct string representation', () => {
      expect(provider.toString()).toBe('[OpenRouter Provider google/gemini-2.5-pro]');
    });

    it('should serialize to JSON correctly', () => {
      const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'openrouter',
        model: 'google/gemini-2.5-pro',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'OPENROUTER_API_KEY',
          apiBaseUrl: OPENROUTER_API_BASE,
          passthrough: {},
        },
      });
    });

    it('should preserve custom apiBaseUrl and apiKeyEnvar overrides', () => {
      const restoreEnv = mockProcessEnv({ CUSTOM_OPENROUTER_KEY: 'custom-test-key' });

      try {
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            apiBaseUrl: 'https://proxy.example.com/openrouter/api/v1',
            apiKeyEnvar: 'CUSTOM_OPENROUTER_KEY',
          },
        });

        expect(provider.config.apiBaseUrl).toBe('https://proxy.example.com/openrouter/api/v1');
        expect(provider.config.apiKeyEnvar).toBe('CUSTOM_OPENROUTER_KEY');
        expect(provider.getApiKey()).toBe('custom-test-key');
      } finally {
        restoreEnv();
      }
    });

    it('should fall back to the default apiBaseUrl and apiKeyEnvar when none are configured', () => {
      const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});

      expect(provider.config.apiBaseUrl).toBe(OPENROUTER_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('OPENROUTER_API_KEY');
    });

    it('should fall back to the default when apiBaseUrl or apiKeyEnvar is an empty string', () => {
      const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
        config: {
          apiBaseUrl: '',
          apiKeyEnvar: '',
        },
      });

      expect(provider.config.apiBaseUrl).toBe(OPENROUTER_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('OPENROUTER_API_KEY');
    });

    it('should call the configured apiBaseUrl instead of the default OpenRouter host', async () => {
      const restoreEnv = mockProcessEnv({ CUSTOM_OPENROUTER_KEY: 'custom-test-key' });

      try {
        const customApiBaseUrl = 'https://proxy.example.com/openrouter/api/v1';
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            apiBaseUrl: customApiBaseUrl,
            apiKeyEnvar: 'CUSTOM_OPENROUTER_KEY',
          },
        });

        const response = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Test output' }, finish_reason: 'stop' }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await provider.callApi('Test prompt');

        const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        expect(url).toBe(`${customApiBaseUrl}/chat/completions`);
        expect((init as RequestInit | undefined)?.headers).toMatchObject({
          Authorization: 'Bearer custom-test-key',
        });
      } finally {
        restoreEnv();
      }
    });

    it('should call the default OpenRouter host when no apiBaseUrl override is configured', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'default-test-key' });

      try {
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});

        const response = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Default host output' }, finish_reason: 'stop' }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await provider.callApi('Test prompt');

        const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        expect(url).toBe(`${OPENROUTER_API_BASE}/chat/completions`);
        expect((init as RequestInit | undefined)?.headers).toMatchObject({
          Authorization: 'Bearer default-test-key',
        });
      } finally {
        restoreEnv();
      }
    });

    it.each([
      ['a null body', null],
      ['missing choices', {}],
      ['null choices', { choices: null }],
      ['non-array choices', { choices: { 0: { message: { content: 'wrong shape' } } } }],
      ['empty choices', { choices: [] }],
      ['a null first choice', { choices: [null] }],
      ['a missing message', { choices: [{}] }],
      ['a null message', { choices: [{ message: null }] }],
      ['a primitive message', { choices: [{ message: 'wrong shape' }] }],
      ['an array message', { choices: [{ message: [] }] }],
      ['an empty message', { choices: [{ message: {} }] }],
      ['object content', { choices: [{ message: { content: { private: 'secret' } } }] }],
      ['numeric content', { choices: [{ message: { content: 42 } }] }],
      ['true content', { choices: [{ message: { content: true } }] }],
      ['false content', { choices: [{ message: { content: false } }] }],
      ['zero content', { choices: [{ message: { content: 0 } }] }],
      ['null content', { choices: [{ message: { content: null } }] }],
      ['empty content', { choices: [{ message: { content: '' } }] }],
      ['blank content', { choices: [{ message: { content: '   ' } }] }],
      ['an empty content array', { choices: [{ message: { content: [] } }] }],
      ['an invalid content array', { choices: [{ message: { content: [42] } }] }],
      [
        'an incomplete structured content part',
        { choices: [{ message: { content: [{ type: 'text' }] } }] },
      ],
      [
        'a malformed first choice even when a later choice is usable',
        { choices: [{ message: {} }, { message: { content: 'must not bypass first choice' } }] },
      ],
      ['an invalid function call', { choices: [{ message: { function_call: { name: 42 } } }] }],
      [
        'a function call without arguments',
        { choices: [{ message: { function_call: { name: 'lookup' } } }] },
      ],
      ['an invalid tool call', { choices: [{ message: { tool_calls: [null] } }] }],
      [
        'a tool call without an id',
        {
          choices: [
            {
              message: {
                tool_calls: [{ type: 'function', function: { name: 'lookup', arguments: '{}' } }],
              },
            },
          ],
        },
      ],
      [
        'a custom tool call without input',
        {
          choices: [
            {
              message: {
                tool_calls: [{ id: 'call_custom', type: 'custom', custom: { name: 'shell' } }],
              },
            },
          ],
        },
      ],
    ])('returns a structured error for %s', async (_description, responseBody) => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});

        // A malformed 200 response must resolve through the provider error contract.
        const response = new Response(JSON.stringify(responseBody), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');
        expect(result.error).toBe('Malformed response data: expected choices[0].message');
        expect(result.cached).toBe(false);
        expect(result.output).toBeUndefined();
        expect(result.tokenUsage).toEqual({ numRequests: 1 });
      } finally {
        restoreEnv();
      }
    });

    it('preserves structured array content allowed by OpenRouter', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});
        const content = [
          { type: 'text', text: 'Hello' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } },
        ];
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { content }, finish_reason: 'stop' }],
              usage: { total_tokens: 2, prompt_tokens: 1, completion_tokens: 1 },
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/json' }),
            },
          ),
        );

        const result = await provider.callApi('Test prompt');

        expect(result.output).toEqual(content);
      } finally {
        restoreEnv();
      }
    });

    it.each([
      [
        'an explicit refusal',
        { message: { refusal: 'Cannot comply' }, finish_reason: 'stop' },
        'Cannot comply',
        'stop',
      ],
      [
        'a content-filter response',
        { message: { content: null }, finish_reason: 'content_filter' },
        'Content filtered by provider',
        'content_filter',
      ],
    ])('preserves %s as a flagged refusal', async (_description, choice, output, finishReason) => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('gpt-4o', {});
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(JSON.stringify({ choices: [choice] }), {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          }),
        );

        const result = await provider.callApi('Test prompt');

        expect(result).toMatchObject({
          output,
          finishReason,
          isRefusal: true,
          guardrails: { flagged: true },
        });
      } finally {
        restoreEnv();
      }
    });

    it('evicts malformed responses while preserving bounded accounting metadata', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('gpt-4o', {
          config: { inputCost: 0.001, outputCost: 0.002 },
        });
        const malformedResponse = new Response(
          JSON.stringify({
            choices: [],
            usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
            private: 'must-not-appear',
            padding: 'x'.repeat(10_000),
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        const recoveredResponse = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }],
            usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries
          .mockResolvedValueOnce(malformedResponse)
          .mockResolvedValueOnce(recoveredResponse);

        const malformed = await provider.callApi('Test prompt');
        expect(malformed).toEqual({
          error: 'Malformed response data: expected choices[0].message',
          tokenUsage: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
          cached: false,
          cost: 0.007,
        });

        const recovered = await provider.callApi('Test prompt');
        expect(recovered.output).toBe('Recovered');
        expect(mockedFetchWithRetries).toHaveBeenCalledTimes(2);
      } finally {
        restoreEnv();
      }
    });

    it('treats a documented choice-level error as an error and evicts it', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const privateDiagnostic = `PRIVATE_DIAGNOSTIC_${'x'.repeat(10_000)}`;
        const provider = new OpenRouterProvider('gpt-4o', {
          config: { inputCost: 0.001, outputCost: 0.002 },
        });
        const choiceErrorResponse = new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: 'partial output must not be graded' },
                finish_reason: 'error',
                error: { code: 502, message: privateDiagnostic },
              },
            ],
            usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        const recoveredResponse = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }],
            usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries
          .mockResolvedValueOnce(choiceErrorResponse)
          .mockResolvedValueOnce(recoveredResponse);

        const failed = await provider.callApi('Test prompt');
        expect(failed.error).toBe('API error: OpenRouter provider returned a generation error');
        expect(failed.error).not.toContain('PRIVATE_DIAGNOSTIC');
        expect(failed.error).not.toContain('partial output must not be graded');
        expect(failed).toMatchObject({
          tokenUsage: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
          cached: false,
          cost: 0.007,
          finishReason: 'error',
        });
        expect(failed.output).toBeUndefined();

        const recovered = await provider.callApi('Test prompt');
        expect(recovered.output).toBe('Recovered');
        expect(mockedFetchWithRetries).toHaveBeenCalledTimes(2);
      } finally {
        restoreEnv();
      }
    });

    it('treats finish_reason=error as a failure even without a choice error object', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('gpt-4o', {});
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: { content: 'partial output must not be graded' },
                  finish_reason: 'error',
                },
              ],
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/json' }),
            },
          ),
        );

        const result = await provider.callApi('Test prompt');

        expect(result).toEqual({
          error: 'API error: OpenRouter provider returned a generation error',
          tokenUsage: { numRequests: 1 },
          cached: false,
          cost: undefined,
          finishReason: 'error',
        });
      } finally {
        restoreEnv();
      }
    });

    it('preserves a safe OpenRouter-reported cost', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('openai/gpt-4o', {});
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'Complete' }, finish_reason: 'stop' }],
              usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2, cost: 0.0042 },
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/json' }),
            },
          ),
        );

        const result = await provider.callApi('Test prompt');

        expect(result.cost).toBe(0.0042);
      } finally {
        restoreEnv();
      }
    });

    it('bounds malformed usage on a successful completion', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('openai/gpt-4o', {});
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'Complete' }, finish_reason: 'stop' }],
              usage: {
                total_tokens: { private: 'must-not-appear' },
                prompt_tokens: -1,
                completion_tokens: 2,
                cost: 'free',
              },
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/json' }),
            },
          ),
        );

        const result = await provider.callApi('Test prompt');

        expect(result).toMatchObject({
          output: 'Complete',
          tokenUsage: { completion: 2, numRequests: 1 },
        });
        expect(result.cost).toBeUndefined();
        expect(JSON.stringify(result)).not.toContain('must-not-appear');
      } finally {
        restoreEnv();
      }
    });

    it('retries a documented choice-level rate limit without exposing its diagnostic', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });
      const registry = new RateLimitRegistry({ maxConcurrency: 1, queueTimeoutMs: 100 });

      try {
        const provider = new OpenRouterProvider('gpt-4o', {
          config: { maxRetries: 1, inputCost: 0.001, outputCost: 0.002 },
        });
        mockedFetchWithRetries
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                choices: [
                  {
                    message: { content: 'partial output' },
                    finish_reason: 'error',
                    error: { code: 429, message: 'PRIVATE_RATE_LIMIT_DIAGNOSTIC' },
                  },
                ],
                usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
              }),
              {
                status: 200,
                statusText: 'OK',
                headers: new Headers({ 'Content-Type': 'application/json' }),
              },
            ),
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }],
                usage: { total_tokens: 10, prompt_tokens: 7, completion_tokens: 3 },
              }),
              {
                status: 200,
                statusText: 'OK',
                headers: new Headers({ 'Content-Type': 'application/json' }),
              },
            ),
          );

        const result = await registry.execute(provider, () => provider.callApi('Test prompt'), {
          ...createProviderRateLimitOptions(),
          getRetryAfter: () => 0,
        });

        expect(result.output).toBe('Recovered');
        expect(result.tokenUsage).toMatchObject({
          total: 15,
          prompt: 10,
          completion: 5,
          numRequests: 2,
        });
        expect(result.cost).toBe(0.02);
        expect(JSON.stringify(result)).not.toContain('PRIVATE_RATE_LIMIT_DIAGNOSTIC');
        expect(mockedFetchWithRetries).toHaveBeenCalledTimes(2);
      } finally {
        registry.dispose();
        restoreEnv();
      }
    });

    it('retries a transient choice-level generation error', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });
      const registry = new RateLimitRegistry({ maxConcurrency: 1, queueTimeoutMs: 100 });

      try {
        const provider = new OpenRouterProvider('gpt-4o', { config: { maxRetries: 1 } });
        mockedFetchWithRetries
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                choices: [
                  {
                    message: { content: 'partial output' },
                    finish_reason: 'error',
                    error: { code: 503, message: 'temporary upstream failure' },
                  },
                ],
              }),
              {
                status: 200,
                statusText: 'OK',
                headers: new Headers({ 'Content-Type': 'application/json' }),
              },
            ),
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }],
              }),
              {
                status: 200,
                statusText: 'OK',
                headers: new Headers({ 'Content-Type': 'application/json' }),
              },
            ),
          );

        const result = await registry.execute(provider, () => provider.callApi('Test prompt'), {
          ...createProviderRateLimitOptions(),
          getRetryAfter: () => 0,
        });

        expect(result.output).toBe('Recovered');
        expect(result.tokenUsage?.numRequests).toBe(2);
        expect(mockedFetchWithRetries).toHaveBeenCalledTimes(2);
      } finally {
        registry.dispose();
        restoreEnv();
      }
    });

    it('returns the structured rate-limit response when retries are exhausted', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });
      const registry = new RateLimitRegistry({ maxConcurrency: 1, queueTimeoutMs: 100 });

      try {
        const provider = new OpenRouterProvider('gpt-4o', { config: { maxRetries: 0 } });
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: { content: 'partial output' },
                  finish_reason: 'error',
                  error: { code: 429, message: 'PRIVATE_RATE_LIMIT_DIAGNOSTIC' },
                },
              ],
              usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2, cost: 0.0042 },
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/json' }),
            },
          ),
        );

        const result = await registry.execute(provider, () => provider.callApi('Test prompt'), {
          ...createProviderRateLimitOptions(),
          getRetryAfter: () => 0,
        });

        expect(result).toMatchObject({
          error: 'API error: OpenRouter provider returned a generation error',
          finishReason: 'error',
          tokenUsage: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
          cost: 0.0042,
          metadata: { rateLimitKind: 'rate_limit', http: { status: 429 } },
        });
        expect(JSON.stringify(result)).not.toContain('PRIVATE_RATE_LIMIT_DIAGNOSTIC');
      } finally {
        registry.dispose();
        restoreEnv();
      }
    });

    it('preserves Retry-After headers on a choice-level rate limit', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('gpt-4o', {});
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: { content: 'partial output' },
                  finish_reason: 'error',
                  error: { code: 429, message: 'rate limited' },
                },
              ],
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({
                'Content-Type': 'application/json',
                'Retry-After': '30',
                'X-RateLimit-Remaining': '0',
              }),
            },
          ),
        );

        const result = await provider.callApi('Test prompt');

        // The scheduler reads rate-limit headers off metadata.http.headers only.
        expect(result.metadata?.http?.headers).toMatchObject({
          'retry-after': '30',
          'x-ratelimit-remaining': '0',
        });

        const options = createProviderRateLimitOptions();
        expect(options.getHeaders?.(result)).toMatchObject({ 'retry-after': '30' });
        // Without the headers this falls through to blind exponential backoff.
        expect(options.getRetryAfter?.(result, undefined)).toBe(30_000);
      } finally {
        restoreEnv();
      }
    });

    it('preserves Retry-After headers on a transient choice-level generation error', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('gpt-4o', {});
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: { content: 'partial output' },
                  finish_reason: 'error',
                  error: { code: 503, message: 'temporary upstream failure' },
                },
              ],
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({
                'Content-Type': 'application/json',
                'Retry-After': '12',
              }),
            },
          ),
        );

        const result = await provider.callApi('Test prompt');

        expect(result.metadata).toMatchObject({
          retryableErrorKind: 'transient_availability',
          http: { status: 503, headers: { 'retry-after': '12' } },
        });
        expect(createProviderRateLimitOptions().getRetryAfter?.(result, undefined)).toBe(12_000);
      } finally {
        restoreEnv();
        restoreEnv();
      }
    });

    it.each([
      {
        apiBaseUrl: 'https://proxy.example.com/openrouter/api/v1/',
        expectedUrl: 'https://proxy.example.com/openrouter/api/v1/chat/completions',
      },
      {
        apiBaseUrl: 'https://proxy.example.com/openrouter/api/v1///',
        expectedUrl: 'https://proxy.example.com/openrouter/api/v1/chat/completions',
      },
      {
        apiBaseUrl: 'https://proxy.example.com/openrouter/api/v1/?api-version=2026-08-18',
        expectedUrl:
          'https://proxy.example.com/openrouter/api/v1/chat/completions?api-version=2026-08-18',
      },
    ])(
      'should normalize the request URL for apiBaseUrl $apiBaseUrl',
      async ({ apiBaseUrl, expectedUrl }) => {
        const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

        try {
          const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
            config: {
              apiBaseUrl,
            },
          });

          const response = new Response(
            JSON.stringify({
              choices: [{ message: { content: 'Test output' }, finish_reason: 'stop' }],
              usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/json' }),
            },
          );
          mockedFetchWithRetries.mockResolvedValueOnce(response);

          await provider.callApi('Test prompt');

          const [url] = mockedFetchWithRetries.mock.calls[0] ?? [];
          expect(provider.config.apiBaseUrl).toBe(apiBaseUrl);
          expect(url).toBe(expectedUrl);
        } finally {
          restoreEnv();
        }
      },
    );

    it('should combine apiBaseUrl override with passthrough options on the request body', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const customApiBaseUrl = 'https://proxy.example.com/openrouter/api/v1';
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            apiBaseUrl: customApiBaseUrl,
            route: 'fallback',
            models: ['google/gemini-2.5-pro', 'anthropic/claude-sonnet-4.6'],
          },
        });

        const response = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Test output' }, finish_reason: 'stop' }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await provider.callApi('Test prompt');

        const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        expect(url).toBe(`${customApiBaseUrl}/chat/completions`);
        const body = JSON.parse((init as RequestInit | undefined)?.body as string);
        expect(body.route).toBe('fallback');
        expect(body.models).toEqual(['google/gemini-2.5-pro', 'anthropic/claude-sonnet-4.6']);
      } finally {
        restoreEnv();
      }
    });

    it('returns a clean error instead of crashing on an empty choices array', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});

        // A 200 response with an empty `choices` array (soft moderation block,
        // upstream hiccup, or n>1 edge cases). Before the fix this made
        // `data.choices[0]` undefined and `.message` threw an opaque TypeError.
        const response = new Response(
          JSON.stringify({
            choices: [],
            usage: { total_tokens: 5, prompt_tokens: 5, completion_tokens: 0 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');
        expect(result.error).toContain('Malformed response data');
        expect(result.output).toBeUndefined();
        // The malformed-response return must carry the cache-hit status so
        // downstream doesn't treat a cached failure as a live provider call.
        expect(result.cached).toBe(false);
      } finally {
        restoreEnv();
      }
    });

    it('returns a clean error instead of crashing when the response has no choices field', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});

        const response = new Response(
          JSON.stringify({
            usage: { total_tokens: 5, prompt_tokens: 5, completion_tokens: 0 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');
        expect(result.error).toContain('Malformed response data');
        expect(result.cached).toBe(false);
      } finally {
        restoreEnv();
      }
    });

    describe('response cost', () => {
      beforeEach(() => {
        mockedFetchWithRetries.mockReset();
      });

      function mockResponse(usage: unknown, status = 200) {
        mockedFetchWithRetries.mockResolvedValueOnce(
          Response.json(
            { choices: [{ message: { content: 'Cost fixture' }, finish_reason: 'stop' }], usage },
            { status, statusText: status === 200 ? 'OK' : 'Bad Request' },
          ),
        );
      }

      function provider(config: Record<string, unknown> = {}, model = 'openai/gpt-4o') {
        return new OpenRouterProvider(model, { config: { apiKey: 'test-key', ...config } });
      }

      describe('BYOK accounting', () => {
        it('preserves the documented non-BYOK charge and independent cost components', async () => {
          mockResponse({
            prompt_tokens: 10,
            completion_tokens: 15,
            total_tokens: 25,
            cost: 0.0012,
            is_byok: false,
            cost_details: {
              upstream_inference_cost: null,
              upstream_inference_prompt_cost: 0.0008,
              upstream_inference_completions_cost: 0.0004,
            },
          });
          const result = await provider().callApi('Cost prompt');
          expect(result.cost).toBe(0.0012);
          expect(result.metadata?.openrouter).toEqual({
            accountCharge: 0.0012,
            isByok: false,
            reportedUpstreamPromptCost: 0.0008,
            reportedUpstreamCompletionCost: 0.0004,
          });
        });

        it.each([
          { charge: 0, details: { upstream_inference_cost: 0.02 } },
          { charge: 0.001, details: { upstream_inference_cost: 0.02 } },
          { charge: 0.25, details: { upstream_inference_cost: 0 } },
          { charge: 0.25, details: undefined },
          { charge: 0.25, details: null },
          { charge: 0.25, details: { upstream_inference_cost: '0.02' } },
        ])('leaves explicit BYOK cost unknown (%j)', async ({ charge, details }) => {
          mockResponse({ cost: charge, is_byok: true, cost_details: details });
          const result = await provider().callApi('Cost prompt');
          expect(result.output).toBe('Cost fixture');
          expect(result.error).toBeUndefined();
          expect(result.cost).toBeUndefined();
          expect(result.metadata?.openrouter).toMatchObject({
            accountCharge: charge,
            isByok: true,
          });
        });

        it('keeps missing BYOK status unknown in the documented usage-accounting example', async () => {
          mockResponse({
            prompt_tokens: 194,
            completion_tokens: 2,
            total_tokens: 196,
            cost: 0.95,
            cost_details: { upstream_inference_cost: 19 },
          });
          const result = await provider().callApi('Cost prompt');
          expect(result.cost).toBe(0.95);
          expect(result.metadata?.openrouter).toEqual({
            accountCharge: 0.95,
            reportedUpstreamInferenceCost: 19,
          });
        });

        it.each(['true', 1, null, {}, []])(
          'does not coerce an invalid BYOK flag (%j)',
          async (flag) => {
            mockResponse({ cost: 0.25, is_byok: flag });
            const result = await provider().callApi('Cost prompt');
            expect(result.cost).toBe(0.25);
            expect(result.metadata?.openrouter).toEqual({ accountCharge: 0.25 });
          },
        );

        it('does not add upstream or server-tool components to a non-BYOK charge', async () => {
          mockResponse({
            cost: 0.25,
            is_byok: false,
            cost_details: {
              upstream_inference_cost: 0.25,
              upstream_inference_prompt_cost: 0.1,
              upstream_inference_completions_cost: 0.15,
              server_tool_cost: 0.05,
            },
          });
          const result = await provider().callApi('Cost prompt');
          expect(result.cost).toBe(0.25);
          expect(result.metadata?.openrouter).toEqual({
            accountCharge: 0.25,
            isByok: false,
            reportedUpstreamInferenceCost: 0.25,
            reportedUpstreamPromptCost: 0.1,
            reportedUpstreamCompletionCost: 0.15,
            reportedServerToolCost: 0.05,
          });
        });

        it.each([
          { config: { cost: 0.01 }, expected: 0.3 },
          { config: { inputCost: 0.01, outputCost: 0.02 }, expected: 0.5 },
          { config: { cost: 0 }, expected: 0 },
          { config: { inputCost: 0.01 }, expected: undefined },
          { config: { cost: -1 }, expected: undefined },
          { config: { cost: Infinity }, expected: undefined },
        ])('preserves configured BYOK rate semantics (%j)', async ({ config, expected }) => {
          mockResponse({ prompt_tokens: 10, completion_tokens: 20, cost: 0, is_byok: true });
          const result = await provider(config).callApi('Cost prompt');
          if (expected === undefined) {
            expect(result.cost).toBeUndefined();
          } else {
            expect(result.cost).toBeCloseTo(expected);
          }
          expect(result.metadata?.openrouter).toEqual({ accountCharge: 0, isByok: true });
        });

        it('uses prompt-level BYOK rates while retaining the reported charge as metadata', async () => {
          mockResponse({ prompt_tokens: 10, completion_tokens: 20, cost: 0.001, is_byok: true });
          const result = await provider({ cost: 1 }).callApi('Cost prompt', {
            vars: {},
            prompt: { raw: 'Cost prompt', label: 'Cost prompt', config: { cost: 0.02 } },
          });
          expect(result.cost).toBeCloseTo(0.6);
          expect(result.metadata?.openrouter).toEqual({ accountCharge: 0.001, isByok: true });
        });

        it('leaves a configured BYOK estimate unknown without token counts', async () => {
          mockResponse({ cost: 0, is_byok: true });
          const result = await provider({ cost: 0.01 }).callApi('Cost prompt');
          expect(result.cost).toBeUndefined();
          expect(result.metadata?.openrouter).toEqual({ accountCharge: 0, isByok: true });
        });

        it.each([
          undefined,
          null,
          {},
          [],
          0,
          'invalid',
          { unrelated: true },
          { cost: null, is_byok: null },
        ])('does not invent billing facts from empty or malformed usage (%j)', async (usage) => {
          mockResponse(usage);
          const result = await provider().callApi('Cost prompt');
          expect(result.output).toBe('Cost fixture');
          expect(result.cost).toBeUndefined();
          expect(result.metadata?.openrouter).toBeUndefined();
        });

        it.each([undefined, null, [], 'invalid', true, {}])(
          'tolerates malformed cost details (%j)',
          async (details) => {
            mockResponse({ cost: 0, is_byok: true, cost_details: details });
            const result = await provider().callApi('Cost prompt');
            expect(result.cost).toBeUndefined();
            expect(result.metadata?.openrouter).toEqual({ accountCharge: 0, isByok: true });
          },
        );

        it('preserves valid zero and partial upstream facts independently', async () => {
          mockResponse({
            cost: 0,
            is_byok: true,
            cost_details: {
              upstream_inference_cost: 0,
              upstream_inference_prompt_cost: '0.1',
              upstream_inference_completions_cost: 0.2,
              server_tool_cost: 0,
            },
          });
          const result = await provider().callApi('Cost prompt');
          expect(result.cost).toBeUndefined();
          expect(result.metadata?.openrouter).toEqual({
            accountCharge: 0,
            isByok: true,
            reportedUpstreamInferenceCost: 0,
            reportedUpstreamCompletionCost: 0.2,
            reportedServerToolCost: 0,
          });
        });

        it.each([-1, '0.02', null, true, {}])(
          'omits invalid upstream components (%j)',
          async (amount) => {
            mockResponse({
              cost: 0,
              is_byok: true,
              cost_details: {
                upstream_inference_cost: amount,
                upstream_inference_prompt_cost: amount,
                upstream_inference_completions_cost: amount,
                server_tool_cost: amount,
              },
            });
            const result = await provider().callApi('Cost prompt');
            expect(result.cost).toBeUndefined();
            expect(result.metadata?.openrouter).toEqual({ accountCharge: 0, isByok: true });
          },
        );

        for (const imageInput of [false, true]) {
          it.each([
            { name: 'standard', byok: false, config: {}, expected: 0.25 },
            { name: 'BYOK', byok: true, config: {}, expected: undefined },
            { name: 'configured BYOK', byok: true, config: { cost: 0.01 }, expected: 0.3 },
          ])(
            `preserves $name accounting on ${imageInput ? 'image-input' : 'text'} cache replay`,
            async ({ byok, config, expected }) => {
              const content = [
                { type: 'text', text: 'Describe this fixture' },
                {
                  type: 'image_url',
                  image_url: {
                    url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=',
                  },
                },
              ];
              const prompt = imageInput
                ? JSON.stringify([{ role: 'user', content }])
                : 'Cost cache prompt';
              const wasCacheEnabled = isCacheEnabled();
              await withCacheEnabled(true, async () => {
                mockResponse({
                  prompt_tokens: 10,
                  completion_tokens: 20,
                  total_tokens: 30,
                  cost: 0.25,
                  is_byok: byok,
                });
                const instance = provider(config);
                const first = await instance.callApi(prompt);
                const second = await instance.callApi(prompt);
                if (expected === undefined) {
                  expect(first.cost).toBeUndefined();
                } else {
                  expect(first.cost).toBeCloseTo(expected);
                }
                expect(first.cached).toBe(false);
                expect(second.cached).toBe(true);
                expect(second.cost).toBe(first.cost);
                expect(first.metadata?.openrouter).toEqual({ accountCharge: 0.25, isByok: byok });
                expect(second.metadata).toEqual(first.metadata);
                expect(mockedFetchWithRetries).toHaveBeenCalledTimes(1);
                const [url, options] = mockedFetchWithRetries.mock.calls[0];
                expect(url).toBe(`${OPENROUTER_API_BASE}/chat/completions`);
                expect(options?.headers).toMatchObject({ Authorization: 'Bearer test-key' });
                if (imageInput) {
                  expect(JSON.parse(options?.body as string).messages[0].content).toEqual(content);
                }
              });
              expect(isCacheEnabled()).toBe(wasCacheEnabled);
            },
          );
        }
      });

      it('uses the total account charge rather than upstream inference cost', async () => {
        mockResponse({
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          cost: 0.012,
          cost_details: { upstream_inference_cost: 0.8 },
        });
        const result = await provider().callApi('Cost prompt');
        expect(result.cost).toBe(0.012);
        expect(result.output).toBe('Cost fixture');
        expect(result.tokenUsage).toMatchObject({ prompt: 10, completion: 20, total: 30 });
      });

      it.each([0, 0.25])('accepts reported cost %s without token counts', async (cost) => {
        mockResponse({ cost });
        expect((await provider().callApi('Cost prompt')).cost).toBe(cost);
      });

      it.each([
        undefined,
        null,
        {},
        { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      ])('does not borrow native OpenAI prices when billing is absent (%j)', async (usage) => {
        mockResponse(usage);
        const result = await provider({}, 'gpt-4o').callApi('Cost prompt');
        expect(result.output).toBe('Cost fixture');
        expect(result.cost).toBeUndefined();
      });

      it.each([-1, '0.01', null, {}, true])('rejects malformed reported cost %j', async (cost) => {
        mockResponse({
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          cost,
          is_byok: false,
        });
        const result = await provider({}, 'gpt-4o').callApi('Cost prompt');
        expect(result.output).toBe('Cost fixture');
        expect(result.cost).toBeUndefined();
        expect(result.metadata?.openrouter).toEqual({ isByok: false });
      });

      it('preserves complete explicit per-token rates for arbitrary gateway IDs', async () => {
        mockResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.5 });
        const result = await provider({ cost: 0.01 }, 'vendor/custom-model').callApi('Cost prompt');
        expect(result.cost).toBeCloseTo(0.3);
      });

      it('gives directional rates priority over the shared rate', async () => {
        mockResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 1.5 });
        const result = await provider({ cost: 1, inputCost: 0.01, outputCost: 0.02 }).callApi(
          'Cost prompt',
        );
        expect(result.cost).toBe(0.5);
      });

      it('preserves an explicit zero rate', async () => {
        mockResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.5 });
        expect((await provider({ cost: 0 }).callApi('Cost prompt')).cost).toBe(0);
      });

      it('honors prompt-level cost overrides', async () => {
        mockResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.5 });
        const result = await provider({ cost: 1 }).callApi('Cost prompt', {
          vars: {},
          prompt: { raw: 'Cost prompt', label: 'Cost prompt', config: { cost: 0.01 } },
        });
        expect(result.cost).toBeCloseTo(0.3);
      });

      it.each([{ inputCost: 0.01 }, { cost: -1 }, { cost: Infinity }, { cost: NaN }])(
        'does not invent cost for incomplete or invalid manual rates (%j)',
        async (config) => {
          mockResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.5 });
          expect((await provider(config, 'gpt-4o').callApi('Cost prompt')).cost).toBeUndefined();
        },
      );

      it('leaves a manual estimate unknown when token counts are missing', async () => {
        mockResponse({ cost: 0.5 });
        expect((await provider({ cost: 0.01 }).callApi('Cost prompt')).cost).toBeUndefined();
      });

      it('keeps custom endpoint routing and authorization when reading cost', async () => {
        mockResponse({ cost: 0.25 });
        const result = await provider({
          apiBaseUrl: 'https://proxy.example.com/openrouter/api/v1',
          apiKey: 'custom-fixture-key',
        }).callApi('Cost prompt');
        expect(result.cost).toBe(0.25);
        const [url, options] = mockedFetchWithRetries.mock.calls[0];
        expect(url).toBe('https://proxy.example.com/openrouter/api/v1/chat/completions');
        expect(options?.headers).toMatchObject({ Authorization: 'Bearer custom-fixture-key' });
      });

      it.each([
        { name: 'reported', config: {}, usage: { cost: 0.25 }, expectedCost: 0.25 },
        { name: 'reported zero', config: {}, usage: { cost: 0 }, expectedCost: 0 },
        { name: 'manual', config: { cost: 0.01 }, usage: { cost: 0.25 }, expectedCost: 0.3 },
        {
          name: 'directional manual',
          config: { inputCost: 0.01, outputCost: 0.02 },
          usage: { cost: 0.25 },
          expectedCost: 0.5,
        },
        { name: 'manual zero', config: { cost: 0 }, usage: { cost: 0.25 }, expectedCost: 0 },
        { name: 'missing billing', config: {}, usage: {}, expectedCost: undefined },
        { name: 'invalid billing', config: {}, usage: { cost: '0.25' }, expectedCost: undefined },
        {
          name: 'partial manual rate',
          config: { inputCost: 0.01 },
          usage: { cost: 0.25 },
          expectedCost: undefined,
        },
        {
          name: 'invalid manual rate',
          config: { cost: -1 },
          usage: { cost: 0.25 },
          expectedCost: undefined,
        },
        {
          name: 'missing token counts',
          config: { cost: 0.01 },
          usage: { cost: 0.25, prompt_tokens: undefined, completion_tokens: undefined },
          expectedCost: undefined,
        },
      ])(
        'preserves logical cost on a promptfoo cache replay ($name)',
        async ({ config, usage, expectedCost }) => {
          expect(process.env.PROMPTFOO_CACHE_TYPE).toBe('memory');
          const wasCacheEnabled = isCacheEnabled();
          await withCacheEnabled(true, async () => {
            mockResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, ...usage });
            const instance = provider(config);
            const first = await instance.callApi('Cost cache prompt');
            const second = await instance.callApi('Cost cache prompt');
            expect(first.cached).toBe(false);
            if (expectedCost === undefined) {
              expect(first.cost).toBeUndefined();
            } else {
              expect(first.cost).toBeCloseTo(expectedCost);
            }
            expect(second).toMatchObject({ cached: true, tokenUsage: { cached: 30 } });
            expect(second.cost).toBe(first.cost);
            expect(mockedFetchWithRetries).toHaveBeenCalledTimes(1);
          });
          expect(isCacheEnabled()).toBe(wasCacheEnabled);
        },
      );

      it('preserves HTTP errors without assigning their billing metadata', async () => {
        mockResponse({ cost: 0.25 }, 400);
        const result = await provider().callApi('Cost prompt');
        expect(result.error).toContain('API error: 400');
        expect(result.cost).toBeUndefined();
      });
    });

    describe('Thinking tokens handling', () => {
      beforeEach(() => {
        mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });
      });

      afterEach(() => {
        mockProcessEnv({ OPENROUTER_API_KEY: undefined });
      });

      it('should handle reasoning field correctly when both reasoning and content are present', async () => {
        const mockResponse = {
          choices: [
            {
              message: {
                content:
                  '<transcript>The sentence is a pangram containing all alphabet letters.</transcript>\n<confidence>green</confidence>',
                reasoning:
                  'I need to analyze the given text and provide a summary in the requested format. The text states that "The quick brown fox jumps over the lazy dog" is a pangram that contains all letters of the alphabet. Let me format this according to the XML structure requested.',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Analyze text and provide summary with XML tags');

        // Should include both thinking and content when showThinking is true (default)
        const expectedOutput = `Thinking: I need to analyze the given text and provide a summary in the requested format. The text states that "The quick brown fox jumps over the lazy dog" is a pangram that contains all letters of the alphabet. Let me format this according to the XML structure requested.\n\n<transcript>The sentence is a pangram containing all alphabet letters.</transcript>\n<confidence>green</confidence>`;
        expect(result.output).toBe(expectedOutput);
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should hide reasoning when showThinking is false', async () => {
        const providerWithoutThinking = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: { showThinking: false },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content:
                  '<transcript>The sentence is a pangram containing all alphabet letters.</transcript>\n<confidence>green</confidence>',
                reasoning:
                  'I need to analyze the given text and provide a summary in the requested format.',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi(
          'Analyze text and provide summary with XML tags',
        );

        // Should only show content, not reasoning
        expect(result.output).toBe(
          '<transcript>The sentence is a pangram containing all alphabet letters.</transcript>\n<confidence>green</confidence>',
        );
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle responses with only reasoning and no content', async () => {
        const mockResponse = {
          choices: [
            {
              message: {
                reasoning: 'This is the thinking process for the response.',
                content: null,
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');

        // Should show reasoning when content is null
        expect(result.output).toBe('This is the thinking process for the response.');
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle models with reasoning field', async () => {
        const nonGeminiProvider = new OpenRouterProvider('anthropic/claude-opus-4.7', {});

        const mockResponse = {
          choices: [
            {
              message: {
                content: 'Regular response with reasoning',
                reasoning: 'Thinking about the best way to respond to this query',
              },
            },
          ],
          usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await nonGeminiProvider.callApi('Test prompt');

        // All models now handle reasoning field when present
        const expectedOutput =
          'Thinking: Thinking about the best way to respond to this query\n\nRegular response with reasoning';
        expect(result.output).toBe(expectedOutput);
        expect(result.tokenUsage).toEqual({
          total: 30,
          prompt: 10,
          completion: 20,
          numRequests: 1,
        });
      });

      it('should handle models without reasoning field', async () => {
        const provider = new OpenRouterProvider('anthropic/claude-opus-4.7', {});

        const mockResponse = {
          choices: [
            {
              message: {
                content: 'Regular response without reasoning',
              },
            },
          ],
          usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Regular response without reasoning');
        expect(result.tokenUsage).toEqual({
          total: 30,
          prompt: 10,
          completion: 20,
          numRequests: 1,
        });
      });

      it('should handle empty reasoning field', async () => {
        const mockResponse = {
          choices: [
            {
              message: {
                content: 'Response with empty reasoning',
                reasoning: '',
              },
            },
          ],
          usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');

        // Should not add "Thinking:" prefix for empty reasoning
        expect(result.output).toBe('Response with empty reasoning');
        expect(result.tokenUsage).toEqual({
          total: 30,
          prompt: 10,
          completion: 20,
          numRequests: 1,
        });
      });

      it('should handle tool calls without including reasoning when showThinking is false', async () => {
        const providerWithoutThinking = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: { showThinking: false },
        });

        const mockToolCall = {
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "San Francisco", "unit": "celsius"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [mockToolCall],
                reasoning:
                  'I need to check the weather for San Francisco to answer the user query.',
              },
            },
          ],
          usage: { total_tokens: 60, prompt_tokens: 25, completion_tokens: 35 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi(
          'What is the weather in San Francisco?',
        );

        // Should return tool_calls directly without any reasoning
        expect(result.output).toEqual([mockToolCall]);

        expect(result.tokenUsage).toEqual({
          total: 60,
          prompt: 25,
          completion: 35,
          numRequests: 1,
        });
      });

      it('should handle function calls without including reasoning when showThinking is false', async () => {
        const providerWithoutThinking = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: { showThinking: false },
        });

        const mockFunctionCall = {
          name: 'get_current_time',
          arguments: '{"timezone": "UTC"}',
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: null,
                function_call: mockFunctionCall,
                reasoning:
                  'The user wants to know the current time, I should call the time function.',
              },
            },
          ],
          usage: { total_tokens: 45, prompt_tokens: 15, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi('What time is it?');

        // Should return function_call directly without any reasoning
        expect(result.output).toEqual(mockFunctionCall);
        expect(result.tokenUsage).toEqual({
          total: 45,
          prompt: 15,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle tool calls without including reasoning even when showThinking is true', async () => {
        // Using the default provider which has showThinking enabled by default
        const mockToolCall = {
          id: 'call_xyz789',
          type: 'function',
          function: {
            name: 'search_database',
            arguments: '{"query": "latest sales data"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [mockToolCall],
                reasoning:
                  'I need to search the database for the latest sales data to provide accurate information.',
              },
            },
          ],
          usage: { total_tokens: 55, prompt_tokens: 20, completion_tokens: 35 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Show me the latest sales data');

        // Tool calls should never include reasoning, regardless of showThinking setting
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 55,
          prompt: 20,
          completion: 35,
          numRequests: 1,
        });
      });

      it('should handle tool calls when content is empty string', async () => {
        const mockToolCall = {
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'get_current_weather',
            arguments: '{"location": "New York, NY", "unit": "fahrenheit"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: '', // Empty string
                tool_calls: [mockToolCall],
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('What is the weather in New York?');

        // Should return tool_calls when content is empty string
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle tool calls when content is whitespace only', async () => {
        const mockToolCall = {
          id: 'call_def456',
          type: 'function',
          function: {
            name: 'get_current_weather',
            arguments: '{"location": "New York, NY", "unit": "fahrenheit"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: '\n\n', // Whitespace only
                tool_calls: [mockToolCall],
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('What is the weather?');

        // Should return tool_calls when content is only whitespace
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle function calls when content is whitespace only', async () => {
        const mockFunctionCall = {
          name: 'calculate_sum',
          arguments: '{"a": 5, "b": 10}',
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: '  \t  ', // Various whitespace characters
                function_call: mockFunctionCall,
              },
            },
          ],
          usage: { total_tokens: 40, prompt_tokens: 15, completion_tokens: 25 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Calculate 5 + 10');

        // Should return function_call when content is only whitespace
        expect(result.output).toEqual(mockFunctionCall);
        expect(result.tokenUsage).toEqual({
          total: 40,
          prompt: 15,
          completion: 25,
          numRequests: 1,
        });
      });

      it('should handle tool calls with reasoning when content is whitespace only', async () => {
        const mockToolCall = {
          id: 'call_ghi789',
          type: 'function',
          function: {
            name: 'get_stock_price',
            arguments: '{"symbol": "AAPL"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: '\t\n \n\t', // Mixed whitespace
                tool_calls: [mockToolCall],
                reasoning: 'The user wants to know the stock price for Apple Inc.',
              },
            },
          ],
          usage: { total_tokens: 60, prompt_tokens: 25, completion_tokens: 35 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('What is AAPL stock price?');

        // Should return tool_calls, ignoring reasoning when there are tool calls
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 60,
          prompt: 25,
          completion: 35,
          numRequests: 1,
        });
      });
      it('keeps a complete function call whose type discriminator is omitted', async () => {
        // OpenRouter sometimes sends tool_calls entries with no `type`; the
        // payload is unambiguous, so the call must survive rather than take
        // the whole message down as malformed.
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});
        const quirksToolCall = {
          id: 'call_abc123',
          function: {
            name: 'get_weather',
            arguments: '{"location": "San Francisco"}',
          },
        };
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                { message: { content: null, tool_calls: [quirksToolCall] }, finish_reason: 'stop' },
              ],
              usage: { total_tokens: 60, prompt_tokens: 25, completion_tokens: 35 },
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/json' }),
            },
          ),
        );

        const result = await provider.callApi('Weather?');

        expect(result.error).toBeUndefined();
        // the call survives verbatim; no synthetic discriminator is added
        expect(result.output).toEqual([
          {
            id: 'call_abc123',
            function: { name: 'get_weather', arguments: '{"location": "San Francisco"}' },
          },
        ]);
      });

      it('should prioritize tool calls over content+reasoning when all three are present (fixes Qwen thinking models)', async () => {
        const providerWithoutThinking = new OpenRouterProvider(
          'qwen/qwen3-235b-a22b-thinking-2507',
          {
            config: { showThinking: false },
          },
        );

        const mockToolCall = {
          id: 'call_qwen_thinking_fix',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "San Francisco"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                // This is the problematic scenario: model returns ALL THREE fields
                content: 'I need to get the weather for San Francisco.',
                reasoning:
                  'The user is asking for weather information. I should use the get_weather function with San Francisco as the location parameter.',
                tool_calls: [mockToolCall],
              },
            },
          ],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi('Get weather for San Francisco');

        // Should prioritize tool_calls and ignore content+reasoning when showThinking is false
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 100,
          prompt: 50,
          completion: 50,
          numRequests: 1,
        });
      });

      it('should prioritize tool calls over content+reasoning even when showThinking is true', async () => {
        // Using the default provider which has showThinking enabled by default
        const mockToolCall = {
          id: 'call_qwen_thinking_enabled',
          type: 'function',
          function: {
            name: 'search_database',
            arguments: '{"query": "user data"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                // All three fields present
                content: 'I will search the database for user data.',
                reasoning:
                  'The user wants to find information in the database. I should call the search function.',
                tool_calls: [mockToolCall],
              },
            },
          ],
          usage: { total_tokens: 80, prompt_tokens: 40, completion_tokens: 40 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Search for user data');

        // Tool calls should always take priority, regardless of showThinking setting
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 80,
          prompt: 40,
          completion: 40,
          numRequests: 1,
        });
      });

      it('should handle responses with empty content and reasoning when showThinking is false', async () => {
        const providerWithoutThinking = new OpenRouterProvider('some/thinking-model', {
          config: { showThinking: false },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content: '',
                reasoning: 'Some thinking process here',
                // No tool_calls
              },
            },
          ],
          usage: { total_tokens: 30, prompt_tokens: 15, completion_tokens: 15 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi('Test prompt');

        // Should return empty string when content is empty and showThinking is false
        expect(result.output).toBe('');
        expect(result.tokenUsage).toEqual({
          total: 30,
          prompt: 15,
          completion: 15,
          numRequests: 1,
        });
      });

      it('should handle responses with only reasoning and no content/tools when showThinking is false', async () => {
        const providerWithoutThinking = new OpenRouterProvider('some/reasoning-model', {
          config: { showThinking: false },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                // No content, no tool_calls
                reasoning: 'This is only reasoning content',
              },
            },
          ],
          usage: { total_tokens: 25, prompt_tokens: 10, completion_tokens: 15 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi('Test prompt');

        // Should return empty string when only reasoning is available and showThinking is false
        expect(result.output).toBe('');
        expect(result.tokenUsage).toEqual({
          total: 25,
          prompt: 10,
          completion: 15,
          numRequests: 1,
        });
      });

      it('should handle API errors', async () => {
        const errorResponse = {
          error: {
            message: 'API Error',
            type: 'invalid_request_error',
          },
        };

        const response = new Response(JSON.stringify(errorResponse), {
          status: 400,
          statusText: 'Bad Request',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');
        expect(result.error).toContain('400 Bad Request');
      });

      it('should pass through OpenRouter-specific options', async () => {
        const providerWithOptions = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            transforms: ['strip-xml-tags'],
            models: ['google/gemini-2.5-pro', 'anthropic/claude-opus-4.7'],
            route: 'fallback',
            provider: {
              order: ['google', 'anthropic'],
            },
          },
        });

        const mockResponse = {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await providerWithOptions.callApi('Test prompt');

        const lastCall = mockedFetchWithRetries.mock.calls[0];
        if (!lastCall) {
          throw new Error('Expected fetch to have been called');
        }
        const requestBody = JSON.parse((lastCall[1] as { body: string }).body);

        expect(requestBody.transforms).toEqual(['strip-xml-tags']);
        expect(requestBody.models).toEqual(['google/gemini-2.5-pro', 'anthropic/claude-opus-4.7']);
        expect(requestBody.route).toBe('fallback');
        expect(requestBody.provider).toEqual({ order: ['google', 'anthropic'] });
      });
    });

    describe('JSON schema response format handling', () => {
      beforeEach(() => {
        mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });
      });

      afterEach(() => {
        mockProcessEnv({ OPENROUTER_API_KEY: undefined });
      });

      it('should parse JSON output when response_format.type is json_schema', async () => {
        const providerWithJsonSchema = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'test_schema',
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    age: { type: 'number' },
                  },
                },
              },
            },
          },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content: '{"name": "John Doe", "age": 30}',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithJsonSchema.callApi('Generate JSON');

        // Should parse the JSON string into an object
        expect(result.output).toEqual({
          name: 'John Doe',
          age: 30,
        });
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle invalid JSON gracefully when response_format.type is json_schema', async () => {
        const providerWithJsonSchema = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'test_schema',
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content: 'This is not valid JSON { broken: }',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithJsonSchema.callApi('Generate JSON');

        // Should return the original string when JSON parsing fails
        expect(result.output).toBe('This is not valid JSON { broken: }');
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should not parse JSON when response_format.type is not json_schema', async () => {
        const regularProvider = new OpenRouterProvider('google/gemini-2.5-pro', {});

        const mockResponse = {
          choices: [
            {
              message: {
                content: '{"name": "John Doe", "age": 30}',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await regularProvider.callApi('Generate JSON');

        // Should return the string as-is without parsing
        expect(result.output).toBe('{"name": "John Doe", "age": 30}');
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle json_schema with reasoning field', async () => {
        const providerWithJsonSchema = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'test_schema',
                schema: {
                  type: 'object',
                  properties: {
                    result: { type: 'string' },
                  },
                },
              },
            },
          },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content: '{"result": "success"}',
                reasoning: 'I formatted the response as JSON according to the schema',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithJsonSchema.callApi('Generate JSON with reasoning');

        // Should parse JSON after adding reasoning prefix
        // The output is built as "Thinking: ...\n\n{content}" and then parsed
        // Since the combined string is not valid JSON, it should return as-is
        expect(result.output).toStrictEqual({ result: 'success' });
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });
    });
  });
});
