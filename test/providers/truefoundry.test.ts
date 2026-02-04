import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import {
  createTrueFoundryProvider,
  TrueFoundryEmbeddingProvider,
  TrueFoundryProvider,
} from '../../src/providers/truefoundry';
import * as fetchModule from '../../src/util/fetch/index';

const TRUEFOUNDRY_API_BASE = 'https://llm-gateway.truefoundry.com';

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x) => x),
    renderVarsInObject: vi.fn((x) => x),
  };
});

vi.mock('../../src/util/fetch/index.ts');

describe('TrueFoundry', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
  });

  describe('TrueFoundryProvider', () => {
    const provider = new TrueFoundryProvider('openai/gpt-4', {});

    it('should initialize with correct model name', () => {
      expect(provider.modelName).toBe('openai/gpt-4');
    });

    describe('isReasoningModel', () => {
      it('should detect GPT-5 models with provider prefix', () => {
        const provider = new TrueFoundryProvider('openai/gpt-5-nano', {});
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should detect GPT-5 models without provider prefix', () => {
        const provider = new TrueFoundryProvider('gpt-5', {});
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should detect o1 models with provider prefix', () => {
        const provider = new TrueFoundryProvider('openai/o1-preview', {});
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should detect o1 models without provider prefix', () => {
        const provider = new TrueFoundryProvider('o1-mini', {});
        expect((provider as any).isReasoningModel()).toBe(true);
      });

      it('should not detect GPT-4 as reasoning model', () => {
        const provider = new TrueFoundryProvider('openai/gpt-4', {});
        expect((provider as any).isReasoningModel()).toBe(false);
      });

      it('should not detect Claude as reasoning model', () => {
        const provider = new TrueFoundryProvider('anthropic/claude-sonnet-4', {});
        expect((provider as any).isReasoningModel()).toBe(false);
      });

      it('should not detect Gemini as reasoning model', () => {
        const provider = new TrueFoundryProvider('vertex-ai/gemini-2.5-pro', {});
        expect((provider as any).isReasoningModel()).toBe(false);
      });
    });

    it('should return correct id', () => {
      expect(provider.id()).toBe('truefoundry:openai/gpt-4');
    });

    it('should return correct string representation', () => {
      expect(provider.toString()).toBe('[TrueFoundry Provider openai/gpt-4]');
    });

    it('should serialize to JSON correctly without API key', () => {
      const provider = new TrueFoundryProvider('openai/gpt-4', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'truefoundry',
        model: 'openai/gpt-4',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'TRUEFOUNDRY_API_KEY',
          apiBaseUrl: TRUEFOUNDRY_API_BASE,
        },
      });
    });

    it('should serialize to JSON correctly with API key redacted', () => {
      const provider = new TrueFoundryProvider('openai/gpt-4', {
        config: {
          apiKey: 'secret-api-key',
          temperature: 0.7,
        },
      });

      const json = provider.toJSON();
      expect(json).toEqual({
        provider: 'truefoundry',
        model: 'openai/gpt-4',
        config: {
          temperature: 0.7,
          apiKey: undefined,
          apiKeyEnvar: 'TRUEFOUNDRY_API_KEY',
          apiBaseUrl: TRUEFOUNDRY_API_BASE,
        },
      });
    });

    it('should handle TrueFoundry-specific metadata configuration', () => {
      const provider = new TrueFoundryProvider('openai/gpt-4', {
        config: {
          metadata: {
            user_id: 'test-user',
            custom_key: 'custom_value',
          },
        },
      });

      expect(provider.toJSON().config).toMatchObject({
        metadata: {
          user_id: 'test-user',
          custom_key: 'custom_value',
        },
      });
    });

    it('should handle TrueFoundry-specific logging configuration', () => {
      const provider = new TrueFoundryProvider('openai/gpt-4', {
        config: {
          loggingConfig: {
            enabled: true,
          },
        },
      });

      expect(provider.toJSON().config).toMatchObject({
        loggingConfig: {
          enabled: true,
        },
      });
    });

    it('should use default apiBaseUrl when not specified', () => {
      const provider = new TrueFoundryProvider('openai/gpt-4', {});
      expect(provider.toJSON().config.apiBaseUrl).toBe('https://llm-gateway.truefoundry.com');
    });

    it('should use custom apiBaseUrl when specified', () => {
      const provider = new TrueFoundryProvider('openai/gpt-4', {
        config: {
          apiBaseUrl: 'https://custom-gateway.example.com',
        },
      });
      expect(provider.toJSON().config.apiBaseUrl).toBe('https://custom-gateway.example.com');
    });

    describe('callApi', () => {
      beforeEach(() => {
        process.env.TRUEFOUNDRY_API_KEY = 'test-key';
      });

      afterEach(() => {
        delete process.env.TRUEFOUNDRY_API_KEY;
      });

      it('should call TrueFoundry API and return output with correct structure', async () => {
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

        const result = await provider.callApi('Test prompt');

        const expectedBody = {
          model: 'openai/gpt-4',
          messages: [{ role: 'user', content: 'Test prompt' }],
          max_tokens: 1024,
          temperature: 0,
        };

        expect(mockedFetchWithRetries).toHaveBeenCalledWith(
          `${TRUEFOUNDRY_API_BASE}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-key',
            },
            body: JSON.stringify(expectedBody),
          },
          300000,
          undefined,
        );

        expect(result).toEqual({
          output: 'Test output',
          tokenUsage: {
            total: 10,
            prompt: 5,
            completion: 5,
            numRequests: 1,
          },
          cached: false,
          cost: undefined,
          latencyMs: expect.any(Number),
          logProbs: undefined,
          guardrails: {
            flagged: false,
          },
          metadata: expect.any(Object),
        });
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      });

      it('should add X-TFY-METADATA header when metadata is provided', async () => {
        const providerWithMetadata = new TrueFoundryProvider('openai/gpt-4', {
          config: {
            metadata: {
              user_id: 'test-user',
              custom_field: 'test-value',
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

        await providerWithMetadata.callApi('Test prompt');

        const lastCall = mockedFetchWithRetries.mock.calls[0];
        if (!lastCall) {
          throw new Error('Expected fetch to have been called');
        }
        const requestOptions = lastCall[1] as { headers: Record<string, string> };
        expect(requestOptions.headers['X-TFY-METADATA']).toBe(
          JSON.stringify({
            user_id: 'test-user',
            custom_field: 'test-value',
          }),
        );
      });

      it('should add X-TFY-LOGGING-CONFIG header when loggingConfig is provided', async () => {
        const providerWithLogging = new TrueFoundryProvider('openai/gpt-4', {
          config: {
            loggingConfig: {
              enabled: true,
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

        await providerWithLogging.callApi('Test prompt');

        const lastCall = mockedFetchWithRetries.mock.calls[0];
        if (!lastCall) {
          throw new Error('Expected fetch to have been called');
        }
        const requestOptions = lastCall[1] as { headers: Record<string, string> };
        expect(requestOptions.headers['X-TFY-LOGGING-CONFIG']).toBe(
          JSON.stringify({
            enabled: true,
          }),
        );
      });

      it('should add both TrueFoundry headers when both configs are provided', async () => {
        const providerWithBoth = new TrueFoundryProvider('openai/gpt-4', {
          config: {
            metadata: { user_id: 'test-user' },
            loggingConfig: { enabled: true },
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

        await providerWithBoth.callApi('Test prompt');

        const lastCall = mockedFetchWithRetries.mock.calls[0];
        if (!lastCall) {
          throw new Error('Expected fetch to have been called');
        }
        const requestOptions = lastCall[1] as { headers: Record<string, string> };
        expect(requestOptions.headers['X-TFY-METADATA']).toBe(
          JSON.stringify({ user_id: 'test-user' }),
        );
        expect(requestOptions.headers['X-TFY-LOGGING-CONFIG']).toBe(
          JSON.stringify({ enabled: true }),
        );
      });

      it('should use cache by default', async () => {
        const mockResponse = {
          choices: [{ message: { content: 'Cached output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValue(response);

        await provider.callApi('Test prompt');
        const cachedResult = await provider.callApi('Test prompt');

        expect(mockedFetchWithRetries).toHaveBeenCalledTimes(1);
        expect(cachedResult).toEqual({
          output: 'Cached output',
          cached: true,
          cost: undefined,
          latencyMs: expect.any(Number),
          logProbs: undefined,
          guardrails: {
            flagged: false,
          },
          // Cached responses don't count as new requests, so numRequests is not included
          tokenUsage: {
            total: 10,
            cached: 10,
          },
          metadata: expect.any(Object),
        });
        expect(cachedResult.latencyMs).toBeGreaterThanOrEqual(0);
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

      it('should handle network errors', async () => {
        mockedFetchWithRetries.mockRejectedValueOnce(new Error('Network error'));

        const result = await provider.callApi('Test prompt');
        expect(result.error).toContain('Network error');
      });

      it('should handle rate limit errors', async () => {
        const rateLimitResponse = new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_error',
            },
          }),
          {
            status: 429,
            statusText: 'Too Many Requests',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(rateLimitResponse);

        const result = await provider.callApi('Test prompt');
        expect(result.error).toContain('429');
        expect(result.error).toContain('Rate limit exceeded');
      });
    });
  });

  describe('TrueFoundryEmbeddingProvider', () => {
    const embeddingProvider = new TrueFoundryEmbeddingProvider('openai/text-embedding-3-large', {});

    beforeEach(() => {
      process.env.TRUEFOUNDRY_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.TRUEFOUNDRY_API_KEY;
    });

    it('should initialize with correct model name', () => {
      expect(embeddingProvider.modelName).toBe('openai/text-embedding-3-large');
    });

    it('should return correct id', () => {
      expect(embeddingProvider.id()).toBe('truefoundry:openai/text-embedding-3-large');
    });

    it('should return correct string representation', () => {
      expect(embeddingProvider.toString()).toBe(
        '[TrueFoundry Embedding Provider openai/text-embedding-3-large]',
      );
    });

    it('should serialize to JSON correctly', () => {
      const provider = new TrueFoundryEmbeddingProvider('openai/text-embedding-3-large', {
        config: {
          apiKey: 'secret-key',
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'truefoundry',
        model: 'openai/text-embedding-3-large',
        config: {
          apiKey: undefined,
          apiKeyEnvar: 'TRUEFOUNDRY_API_KEY',
          apiBaseUrl: TRUEFOUNDRY_API_BASE,
        },
      });
    });

    it('should call embedding API successfully', async () => {
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
            index: 0,
          },
        ],
        usage: {
          prompt_tokens: 5,
          total_tokens: 5,
        },
      };

      const response = new Response(JSON.stringify(mockResponse), {
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });
      mockedFetchWithRetries.mockResolvedValueOnce(response);

      const result = await embeddingProvider.callEmbeddingApi('Test text');

      expect(mockedFetchWithRetries).toHaveBeenCalledWith(
        `${TRUEFOUNDRY_API_BASE}/embeddings`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        }),
        300000,
        undefined,
      );

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
        latencyMs: expect.any(Number),
        tokenUsage: {
          total: 5,
          prompt: 5,
          completion: 0,
          numRequests: 1,
        },
      });
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should add TrueFoundry headers to embedding requests', async () => {
      const providerWithHeaders = new TrueFoundryEmbeddingProvider(
        'openai/text-embedding-3-large',
        {
          config: {
            metadata: { user_id: 'test-user' },
            loggingConfig: { enabled: true },
          },
        },
      );

      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
            index: 0,
          },
        ],
        usage: {
          prompt_tokens: 5,
          total_tokens: 5,
        },
      };

      const response = new Response(JSON.stringify(mockResponse), {
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });
      mockedFetchWithRetries.mockResolvedValueOnce(response);

      await providerWithHeaders.callEmbeddingApi('Test text');

      const lastCall = mockedFetchWithRetries.mock.calls[0];
      if (!lastCall) {
        throw new Error('Expected fetch to have been called');
      }
      const requestOptions = lastCall[1] as { headers: Record<string, string> };
      expect(requestOptions.headers['X-TFY-METADATA']).toBe(
        JSON.stringify({ user_id: 'test-user' }),
      );
      expect(requestOptions.headers['X-TFY-LOGGING-CONFIG']).toBe(
        JSON.stringify({ enabled: true }),
      );
    });

    it('should handle embedding API errors', async () => {
      const errorResponse = {
        error: {
          message: 'Invalid model',
          type: 'invalid_request_error',
        },
      };

      const response = new Response(JSON.stringify(errorResponse), {
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });
      mockedFetchWithRetries.mockResolvedValueOnce(response);

      const result = await embeddingProvider.callEmbeddingApi('Test text');
      expect(result.error).toBeDefined();
    });

    it('should use default apiBaseUrl when not specified', () => {
      const provider = new TrueFoundryEmbeddingProvider('openai/text-embedding-3-large', {});
      expect(provider.toJSON().config.apiBaseUrl).toBe('https://llm-gateway.truefoundry.com');
    });

    it('should use custom apiBaseUrl when specified', () => {
      const provider = new TrueFoundryEmbeddingProvider('openai/text-embedding-3-large', {
        config: {
          apiBaseUrl: 'https://custom-gateway.example.com',
        },
      });
      expect(provider.toJSON().config.apiBaseUrl).toBe('https://custom-gateway.example.com');
    });
  });

  describe('createTrueFoundryProvider', () => {
    it('should create chat provider for non-embedding models', () => {
      const provider = createTrueFoundryProvider('truefoundry:openai/gpt-4', {
        config: {
          config: { temperature: 0.5 },
        },
      });
      expect(provider).toBeInstanceOf(TrueFoundryProvider);
      expect((provider as TrueFoundryProvider).modelName).toBe('openai/gpt-4');
    });

    it('should create embedding provider for embedding models', () => {
      const provider = createTrueFoundryProvider('truefoundry:openai/text-embedding-3-large', {
        config: {
          config: { temperature: 0.5 },
        },
      });
      expect(provider).toBeInstanceOf(TrueFoundryEmbeddingProvider);
      expect((provider as TrueFoundryEmbeddingProvider).modelName).toBe(
        'openai/text-embedding-3-large',
      );
    });

    it('should pass config options correctly to provider', () => {
      const provider = createTrueFoundryProvider('truefoundry:openai/gpt-4', {
        config: {
          config: {
            temperature: 0.8,
            apiBaseUrl: 'https://custom.example.com',
          },
        },
        env: { CUSTOM_VAR: 'test' },
      });

      const json = (provider as TrueFoundryProvider).toJSON();
      expect(json.config.temperature).toBe(0.8);
      expect(json.config.apiBaseUrl).toBe('https://custom.example.com');
    });

    it('should handle model names with colons', () => {
      const provider = createTrueFoundryProvider('truefoundry:provider:model:version', {});
      expect((provider as TrueFoundryProvider).modelName).toBe('provider:model:version');
    });
  });
});
