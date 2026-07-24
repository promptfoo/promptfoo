import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, fetchWithCache } from '../../src/cache';
import { SnowflakeCortexProvider } from '../../src/providers/snowflake';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
    clearCache: vi.fn(),
    enableCache: vi.fn(),
    disableCache: vi.fn(),
    isCacheEnabled: vi.fn(),
  };
});

const mockFetchWithCache = vi.mocked(fetchWithCache);

describe('Snowflake Cortex Provider', () => {
  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
    mockProcessEnv({ SNOWFLAKE_ACCOUNT_IDENTIFIER: undefined });
    mockProcessEnv({ SNOWFLAKE_API_KEY: undefined });
  });

  describe('initialization', () => {
    it('should initialize with accountIdentifier from config', () => {
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
        },
      });

      expect(provider.modelName).toBe('mistral-large2');
      expect(provider.id()).toBe('snowflake:mistral-large2');
      expect(provider.toString()).toBe('[Snowflake Cortex Provider mistral-large2]');
    });

    it('should initialize with accountIdentifier from environment', () => {
      mockProcessEnv({ SNOWFLAKE_ACCOUNT_IDENTIFIER: 'myorg-myaccount' });

      const provider = new SnowflakeCortexProvider('claude-3-5-sonnet', {
        config: {
          apiKey: 'test-key',
        },
      });

      expect(provider.modelName).toBe('claude-3-5-sonnet');
    });

    it('should throw error when accountIdentifier is not provided', () => {
      expect(() => {
        new SnowflakeCortexProvider('mistral-large2', {
          config: {
            apiKey: 'test-key',
          },
        });
      }).toThrow('Snowflake provider requires an account identifier');
    });

    it('should use apiBaseUrl when provided instead of constructing from accountIdentifier', () => {
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          apiBaseUrl: 'https://custom.snowflakecomputing.com',
          apiKey: 'test-key',
        },
      });

      expect(provider['getApiUrl']()).toBe('https://custom.snowflakecomputing.com');
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON correctly', () => {
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'secret-key',
          temperature: 0.7,
        },
      });

      const json = provider.toJSON();
      expect(json).toEqual({
        provider: 'snowflake',
        model: 'mistral-large2',
        config: expect.objectContaining({
          temperature: 0.7,
          apiKey: undefined,
        }),
      });
    });
  });

  describe('callApi', () => {
    beforeEach(() => {
      mockProcessEnv({ SNOWFLAKE_ACCOUNT_IDENTIFIER: 'myorg-myaccount' });
      mockProcessEnv({ SNOWFLAKE_API_KEY: 'test-key' });
    });

    it('should call Snowflake Cortex API with correct endpoint', async () => {
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
        },
      });

      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };

      mockFetchWithCache.mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        'https://myorg-myaccount.snowflakecomputing.com/api/v2/cortex/inference:complete',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        }),
        expect.any(Number),
        'json',
        undefined,
      );

      expect(result).toEqual({
        output: 'Test response',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          numRequests: 1,
        },
        cached: false,
        cost: undefined,
        finishReason: 'stop',
        latencyMs: undefined,
      });
    });

    it('should handle API errors', async () => {
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
        },
      });

      mockFetchWithCache.mockResolvedValueOnce({
        data: 'API error',
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const result = await provider.callApi('Test prompt');
      expect(result.error).toContain('400 Bad Request');
    });

    it('should handle network errors', async () => {
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
        },
      });

      mockFetchWithCache.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.callApi('Test prompt');
      expect(result.error).toContain('Network error');
    });

    it('should handle tool calls', async () => {
      const provider = new SnowflakeCortexProvider('claude-3-5-sonnet', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
        },
      });

      const mockResponse = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: { name: 'test_function', arguments: '{"arg": "value"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };

      mockFetchWithCache.mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');
      expect(result.output).toEqual([
        {
          id: 'call_123',
          type: 'function',
          function: { name: 'test_function', arguments: '{"arg": "value"}' },
        },
      ]);
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
      ['array content', { choices: [{ message: { content: [{ type: 'text', text: 'hello' }] } }] }],
      ['numeric content', { choices: [{ message: { content: 42 } }] }],
      ['true content', { choices: [{ message: { content: true } }] }],
      ['false content', { choices: [{ message: { content: false } }] }],
      ['zero content', { choices: [{ message: { content: 0 } }] }],
      ['null content', { choices: [{ message: { content: null } }] }],
      ['empty content', { choices: [{ message: { content: '' } }] }],
      ['blank content', { choices: [{ message: { content: '   ' } }] }],
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
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
        },
      });
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);

      // A malformed 200 response must resolve through the provider error contract.
      mockFetchWithCache.mockResolvedValueOnce({
        data: responseBody,
        cached: false,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
      });

      const result = await provider.callApi('Test prompt');
      expect(result.error).toBe('Malformed response data: expected choices[0].message');
      expect(result.cached).toBe(false);
      expect(result.output).toBeUndefined();
      expect(result.tokenUsage).toEqual({ numRequests: 1 });
      expect(deleteFromCache).toHaveBeenCalledOnce();
    });

    it('preserves a bounded Snowflake HTTP-200 error code without copying diagnostics', async () => {
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
        },
      });
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);

      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          message: 'PRIVATE_SESSION_DIAGNOSTIC',
          code: 390112,
          request_id: '550e8400-e29b-41d4-a716-446655440000',
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        latencyMs: 42,
        deleteFromCache,
      });

      const result = await provider.callApi('Test prompt');

      expect(result).toMatchObject({
        error: 'API error: Snowflake provider returned error code 390112',
        tokenUsage: { numRequests: 1 },
        cached: false,
        latencyMs: 42,
        metadata: { snowflakeErrorCode: '390112' },
      });
      expect(JSON.stringify(result)).not.toContain('PRIVATE_SESSION_DIAGNOSTIC');
      expect(deleteFromCache).toHaveBeenCalledOnce();
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
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
        },
      });

      mockFetchWithCache.mockResolvedValueOnce({
        data: { choices: [choice] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(result).toMatchObject({
        output,
        finishReason,
        isRefusal: true,
        guardrails: { flagged: true },
      });
    });

    it('treats finish_reason=error as a failure', async () => {
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
        },
      });
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);

      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: { content: 'partial output must not be graded' },
              finish_reason: 'error',
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        latencyMs: 42,
        deleteFromCache,
      });

      const result = await provider.callApi('Test prompt');

      expect(result).toEqual({
        error: 'API error: Snowflake provider returned a generation error',
        tokenUsage: { numRequests: 1 },
        cached: false,
        latencyMs: 42,
        cost: undefined,
        finishReason: 'error',
      });
      expect(deleteFromCache).toHaveBeenCalledOnce();
    });

    it('bounds malformed usage on a successful completion', async () => {
      const provider = new SnowflakeCortexProvider('mistral-large2', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
        },
      });

      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'Complete' }, finish_reason: 'stop' }],
          usage: {
            total_tokens: { private: 'must-not-appear' },
            prompt_tokens: -1,
            completion_tokens: 2,
            cost: 'free',
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(result).toMatchObject({
        output: 'Complete',
        tokenUsage: { completion: 2, numRequests: 1 },
      });
      expect(result.cost).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('must-not-appear');
    });

    it('preserves cached accounting metadata when rejecting a malformed response', async () => {
      const provider = new SnowflakeCortexProvider('gpt-4o', {
        config: {
          accountIdentifier: 'myorg-myaccount',
          apiKey: 'test-key',
          inputCost: 0.001,
          outputCost: 0.002,
        },
      });
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);

      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          choices: [{ finish_reason: 'content_filter' }],
          usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
          private: 'must-not-appear',
          padding: 'x'.repeat(10_000),
        },
        cached: true,
        status: 200,
        statusText: 'OK',
        latencyMs: 42,
        deleteFromCache,
      });

      const result = await provider.callApi('Test prompt');
      expect(result).toEqual({
        error: 'Malformed response data: expected choices[0].message',
        tokenUsage: { cached: 5, total: 5, numRequests: 0 },
        cached: true,
        latencyMs: 42,
        cost: 0.007,
        finishReason: 'content_filter',
      });
      expect(deleteFromCache).toHaveBeenCalledOnce();
    });
  });
});
