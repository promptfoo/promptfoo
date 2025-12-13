import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, fetchWithCache } from '../../src/cache';
import { SnowflakeCortexProvider } from '../../src/providers/snowflake';

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
    delete process.env.SNOWFLAKE_ACCOUNT_IDENTIFIER;
    delete process.env.SNOWFLAKE_API_KEY;
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
      process.env.SNOWFLAKE_ACCOUNT_IDENTIFIER = 'myorg-myaccount';

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
      process.env.SNOWFLAKE_ACCOUNT_IDENTIFIER = 'myorg-myaccount';
      process.env.SNOWFLAKE_API_KEY = 'test-key';
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
  });
});
