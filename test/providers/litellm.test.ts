import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { createLiteLLMProvider, LiteLLMProvider } from '../../src/providers/litellm';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockFetchWithCache = vi.mocked(fetchWithCache);

// Mock fetch for API call tests
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const originalOpenAiTemperature = process.env.OPENAI_TEMPERATURE;

describe('LiteLLM Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessEnv({ OPENAI_TEMPERATURE: undefined });
  });

  afterEach(() => {
    vi.resetAllMocks();
    mockFetch.mockReset();
    vi.unstubAllEnvs();
    if (originalOpenAiTemperature === undefined) {
      mockProcessEnv({ OPENAI_TEMPERATURE: undefined });
    } else {
      mockProcessEnv({ OPENAI_TEMPERATURE: originalOpenAiTemperature });
    }
  });
  describe('createLiteLLMProvider', () => {
    it('should create a chat provider by default', () => {
      const provider = createLiteLLMProvider('litellm:gpt-4', {});
      expect(provider).toBeInstanceOf(LiteLLMProvider);
    });

    it('should create a chat provider when explicitly specified', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect(provider).toBeInstanceOf(LiteLLMProvider);
    });

    it('should create a completion provider', () => {
      const provider = createLiteLLMProvider('litellm:completion:gpt-3.5-turbo-instruct', {});
      // Check that it has the right methods and identity
      expect(provider.id()).toBe('litellm:completion:gpt-3.5-turbo-instruct');
      expect(provider.toString()).toContain('LiteLLM Provider completion');
    });

    it('should create an embedding provider', () => {
      const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {});
      // Check that it has the right methods and identity
      expect(provider.id()).toBe('litellm:embedding:text-embedding-3-small');
      expect(provider.toString()).toContain('LiteLLM Provider embedding');
    });

    it('should support embeddings alias', () => {
      const provider = createLiteLLMProvider('litellm:embeddings:text-embedding-3-small', {});
      // Check that it has the right methods and identity
      expect(provider.id()).toBe('litellm:embedding:text-embedding-3-small');
      expect(provider.toString()).toContain('LiteLLM Provider embedding');
    });

    it('should use custom apiBaseUrl from config', () => {
      const customUrl = 'https://custom.litellm.com';
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            apiBaseUrl: customUrl,
          },
        },
      });
      expect(provider.config.apiBaseUrl).toBe(customUrl);
    });

    it('should use default apiBaseUrl if not provided', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect(provider.config.apiBaseUrl).toBe('http://0.0.0.0:4000');
    });

    it('should set apiKeyRequired to false', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect(provider.config.apiKeyRequired).toBe(false);
    });

    it('should set apiKeyEnvar to LITELLM_API_KEY', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect(provider.config.apiKeyEnvar).toBe('LITELLM_API_KEY');
    });

    it('should work with LITELLM_API_KEY environment variable', () => {
      const originalEnv = process.env.LITELLM_API_KEY;
      mockProcessEnv({ LITELLM_API_KEY: 'test-litellm-key' });

      try {
        const provider = createLiteLLMProvider('litellm:gpt-4', {
          config: {
            config: {
              apiBaseUrl: 'http://localhost:4000',
            },
          },
        });

        // Verify config is set correctly
        expect(provider.config.apiKeyRequired).toBe(false);
        expect(provider.config.apiKeyEnvar).toBe('LITELLM_API_KEY');

        // The wrapped provider should have the API key
        const wrappedProvider = (provider as any).provider;
        expect(wrappedProvider.getApiKey()).toBe('test-litellm-key');
      } finally {
        if (originalEnv === undefined) {
          mockProcessEnv({ LITELLM_API_KEY: undefined });
        } else {
          mockProcessEnv({ LITELLM_API_KEY: originalEnv });
        }
      }
    });

    it('should handle model names with colons', () => {
      const provider = createLiteLLMProvider('litellm:chat:custom:model:v1', {});
      expect(provider).toBeInstanceOf(LiteLLMProvider);
      expect(provider.id()).toContain('custom:model:v1');
    });

    it('should pass through additional config options', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            temperature: 0.7,
            max_tokens: 100,
          },
        },
      });
      expect(provider.config.temperature).toBe(0.7);
      expect(provider.config.max_tokens).toBe(100);
    });

    describe('Provider Identity', () => {
      it('should return LiteLLM identity for chat provider', () => {
        const provider = createLiteLLMProvider('litellm:gpt-4', {});
        expect(provider.id()).toBe('litellm:gpt-4');
        expect(provider.toString()).toBe('[LiteLLM Provider gpt-4]');
        expect(provider.toJSON).toBeDefined();
        expect(provider.toJSON!()).toEqual({
          provider: 'litellm',
          model: 'gpt-4',
          type: 'chat',
          config: expect.any(Object),
        });
      });

      it('should return LiteLLM identity for explicit chat provider', () => {
        const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
        expect(provider.id()).toBe('litellm:gpt-4');
        expect(provider.toString()).toBe('[LiteLLM Provider gpt-4]');
      });

      it('should return LiteLLM identity for completion provider', () => {
        const provider = createLiteLLMProvider('litellm:completion:gpt-3.5-turbo-instruct', {});
        expect(provider.id()).toBe('litellm:completion:gpt-3.5-turbo-instruct');
        expect(provider.toString()).toBe('[LiteLLM Provider completion gpt-3.5-turbo-instruct]');
        expect(provider.toJSON).toBeDefined();
        expect(provider.toJSON!()).toEqual({
          provider: 'litellm',
          model: 'gpt-3.5-turbo-instruct',
          type: 'completion',
          config: expect.any(Object),
        });
      });

      it('should return LiteLLM identity for embedding provider', () => {
        const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {});
        expect(provider.id()).toBe('litellm:embedding:text-embedding-3-small');
        expect(provider.toString()).toBe('[LiteLLM Provider embedding text-embedding-3-small]');
        expect(provider.toJSON).toBeDefined();
        expect(provider.toJSON!()).toEqual({
          provider: 'litellm',
          model: 'text-embedding-3-small',
          type: 'embedding',
          config: expect.any(Object),
        });
      });
    });

    describe('Config handling', () => {
      it('should not override default apiBaseUrl with falsy values', () => {
        const provider1 = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: {
            config: {
              apiBaseUrl: null as any,
            },
          },
        });
        expect(provider1.config.apiBaseUrl).toBe('http://0.0.0.0:4000');

        const provider2 = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: {
            config: {
              apiBaseUrl: undefined,
            },
          },
        });
        expect(provider2.config.apiBaseUrl).toBe('http://0.0.0.0:4000');

        const provider3 = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: {
            config: {
              apiBaseUrl: '',
            },
          },
        });
        expect(provider3.config.apiBaseUrl).toBe('');
      });

      it('should override default apiBaseUrl with truthy values', () => {
        const customUrl = 'https://custom.litellm.com';
        const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: {
            config: {
              apiBaseUrl: customUrl,
            },
          },
        });
        expect(provider.config.apiBaseUrl).toBe(customUrl);
      });

      it('should use LITELLM_API_BASE from provider env when config.apiBaseUrl is not set', () => {
        const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: {
            config: {},
            env: { LITELLM_API_BASE: 'http://my-litellm-server' },
          },
        });
        expect(provider.config.apiBaseUrl).toBe('http://my-litellm-server');
      });

      it('should use LITELLM_API_BASE from context env when config and provider env are not set', () => {
        const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: { config: {} },
          env: { LITELLM_API_BASE: 'http://context-litellm.example.com' },
        });
        expect(provider.config.apiBaseUrl).toBe('http://context-litellm.example.com');
      });

      it('should use LITELLM_API_BASE from process env when no config or options env set', () => {
        vi.stubEnv('LITELLM_API_BASE', 'http://env-litellm.example.com');
        const provider = createLiteLLMProvider('litellm:chat:gpt-4', { config: { config: {} } });
        expect(provider.config.apiBaseUrl).toBe('http://env-litellm.example.com');
      });

      it('should prefer provider env over context env and process env', () => {
        vi.stubEnv('LITELLM_API_BASE', 'http://process-env.example.com');
        const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: {
            config: {},
            env: { LITELLM_API_BASE: 'http://provider-env-wins.example.com' },
          },
          env: { LITELLM_API_BASE: 'http://context-env.example.com' },
        });
        expect(provider.config.apiBaseUrl).toBe('http://provider-env-wins.example.com');
      });

      it('should prefer config.apiBaseUrl over provider env, context env, and process env', () => {
        vi.stubEnv('LITELLM_API_BASE', 'http://env.example.com');
        const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: {
            config: { apiBaseUrl: 'https://config-wins.com' },
            env: { LITELLM_API_BASE: 'http://provider-env.example.com' },
          },
          env: { LITELLM_API_BASE: 'http://context-env.example.com' },
        });
        expect(provider.config.apiBaseUrl).toBe('https://config-wins.com');
      });
    });
  });

  describe('Embedding Provider Functionality', () => {
    it('should have callEmbeddingApi method', () => {
      const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {});
      expect(typeof provider.callEmbeddingApi).toBe('function');
    });

    it('should be recognized as a valid embedding provider', () => {
      const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {});
      // Check that it has either callEmbeddingApi or callSimilarityApi (matching matcher provider validation)
      const isValidEmbeddingProvider =
        'callEmbeddingApi' in provider || 'callSimilarityApi' in provider;
      expect(isValidEmbeddingProvider).toBe(true);
    });

    it('should not have callEmbeddingApi method for chat providers', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect('callEmbeddingApi' in provider).toBe(false);
    });

    it('should not have callEmbeddingApi method for completion providers', () => {
      const provider = createLiteLLMProvider('litellm:completion:gpt-3.5-turbo-instruct', {});
      expect('callEmbeddingApi' in provider).toBe(false);
    });

    it('should pass through custom configuration to embedding provider', () => {
      const customConfig = {
        apiBaseUrl: 'https://custom.litellm.com',
        apiKey: 'custom-key',
        temperature: 0.5,
      };
      const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {
        config: {
          config: customConfig,
        },
      });
      expect(provider.config).toMatchObject(customConfig);
    });

    it('should handle model names with colons for embedding providers', () => {
      const provider = createLiteLLMProvider('litellm:embedding:custom:embedding:model:v1', {});
      expect(provider.id()).toBe('litellm:embedding:custom:embedding:model:v1');
      expect(typeof provider.callEmbeddingApi).toBe('function');
    });
  });

  describe('Temperature zero handling (GitHub issue #7322)', () => {
    it('should correctly pass temperature: 0 to the underlying provider config', () => {
      // This test verifies the fix for GitHub issue #7322 where temperature: 0
      // was not being sent to the API because of a falsy check
      const provider = createLiteLLMProvider('litellm:chat:gpt-3.5-turbo', {
        config: {
          config: {
            temperature: 0,
          },
        },
      });

      // Verify the config is correctly set with temperature: 0
      expect(provider.config.temperature).toBe(0);
      expect('temperature' in provider.config).toBe(true);
    });

    it('should correctly pass max_tokens: 0 to the underlying provider config when explicitly set', () => {
      // While max_tokens: 0 is impractical, it should still be preserved if explicitly configured
      const provider = createLiteLLMProvider('litellm:chat:gpt-3.5-turbo', {
        config: {
          config: {
            max_tokens: 0,
          },
        },
      });

      // Verify the config is correctly set with max_tokens: 0
      expect(provider.config.max_tokens).toBe(0);
      expect('max_tokens' in provider.config).toBe(true);
    });
  });

  describe('Temperature omission for proxy providers (GitHub issue #8044)', () => {
    const mockResponse = {
      data: {
        choices: [{ message: { content: 'Test output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    };

    it('should omit temperature from request body when not configured', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            apiKey: 'test-key',
          },
        },
      });

      await provider.callApi('Test prompt');

      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(call[1].body);

      expect(body.temperature).toBeUndefined();
      expect('temperature' in body).toBe(false);
    });

    it('should send temperature: 0 when explicitly configured', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            apiKey: 'test-key',
            temperature: 0,
          },
        },
      });

      await provider.callApi('Test prompt');

      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(call[1].body);

      expect(body.temperature).toBe(0);
      expect('temperature' in body).toBe(true);
    });

    it('should send temperature: 0.7 when explicitly configured', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            apiKey: 'test-key',
            temperature: 0.7,
          },
        },
      });

      await provider.callApi('Test prompt');

      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(call[1].body);

      expect(body.temperature).toBe(0.7);
      expect('temperature' in body).toBe(true);
    });

    it('should use OPENAI_TEMPERATURE env var when set', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);
      mockProcessEnv({ OPENAI_TEMPERATURE: '0.5' });

      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            apiKey: 'test-key',
          },
        },
      });

      await provider.callApi('Test prompt');

      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(call[1].body);

      expect(body.temperature).toBe(0.5);
      expect('temperature' in body).toBe(true);
    });

    it('should set omitDefaults to true by default', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect(provider.config.omitDefaults).toBe(true);
    });

    it('should allow user to override omitDefaults', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            omitDefaults: false,
          },
        },
      });
      expect(provider.config.omitDefaults).toBe(false);
    });

    it('should send default temperature: 0 when omitDefaults is false', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            apiKey: 'test-key',
            omitDefaults: false,
          },
        },
      });

      await provider.callApi('Test prompt');

      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(call[1].body);

      expect(body.temperature).toBe(0);
      expect('temperature' in body).toBe(true);
      expect(body.max_tokens).toBe(1024);
      expect('max_tokens' in body).toBe(true);
    });

    it('should omit max_tokens from request body when not configured', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            apiKey: 'test-key',
          },
        },
      });

      await provider.callApi('Test prompt');

      const call = mockFetchWithCache.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(call[1].body);

      expect(body.max_tokens).toBeUndefined();
      expect('max_tokens' in body).toBe(false);
    });
  });

  describe('missing API key', () => {
    let restoreEnv: () => void;

    beforeEach(() => {
      restoreEnv = mockProcessEnv({ LITELLM_API_KEY: undefined, OPENAI_API_KEY: undefined });
    });

    afterEach(() => restoreEnv());

    const unauthorized = {
      data: {
        error: {
          message: 'Authentication Error, No api key passed in.',
          type: 'auth_error',
          code: '401',
        },
      },
      cached: false,
      status: 401,
      statusText: 'Unauthorized',
    };

    it.each(['chat', 'completion', 'embedding'])(
      'explains a keyless %s authentication failure',
      async (type) => {
        mockFetchWithCache.mockResolvedValue(unauthorized);
        const provider = createLiteLLMProvider(`litellm:${type}:test-model`);

        const result =
          type === 'embedding'
            ? await provider.callEmbeddingApi!('test')
            : await provider.callApi('test');

        expect(result.error).toContain('Authentication Error');
        expect(result.error).toContain('Set LITELLM_API_KEY');
      },
    );

    it('does not send an OpenAI key to a keyless proxy that accepts the request', async () => {
      mockProcessEnv({ OPENAI_API_KEY: 'openai-only-key' });
      mockFetchWithCache.mockResolvedValue({
        data: { choices: [{ message: { content: 'ok' } }] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = createLiteLLMProvider('litellm:chat:test-model');
      const result = await provider.callApi('test');

      expect(result.output).toBe('ok');
      expect(result.error).toBeUndefined();
      const headers = mockFetchWithCache.mock.calls[0]?.[1]?.headers;
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('does not alter unrelated errors or errors with an explicitly configured credential', async () => {
      mockFetchWithCache.mockResolvedValueOnce({
        data: { error: { message: 'Unavailable' } },
        cached: false,
        status: 503,
        statusText: 'Service Unavailable',
      });
      const keyless = createLiteLLMProvider('litellm:chat:test-model');
      const unavailable = await keyless.callApi('test');
      expect(unavailable.error).toContain('503');
      expect(unavailable.error).not.toContain('Set LITELLM_API_KEY');

      mockFetchWithCache.mockResolvedValue(unauthorized);
      const keyed = createLiteLLMProvider('litellm:chat:test-model', {
        env: { LITELLM_API_KEY: 'scoped-key' },
      }) as LiteLLMProvider;
      expect(keyed.getApiKey?.()).toBe('scoped-key');
      expect((await keyed.callApi('test')).error).not.toContain('Set LITELLM_API_KEY');

      const headerAuth = createLiteLLMProvider('litellm:chat:test-model', {
        config: { config: { headers: { Authorization: 'Bearer custom-key' } } },
      });
      expect((await headerAuth.callApi('test')).error).not.toContain('Set LITELLM_API_KEY');
    });

    it.each([
      ['chat', 'x-api-key'],
      ['completion', 'X-Gateway-Identity'],
      ['embedding', 'Cookie'],
    ])('does not append the key hint for %s with an explicit %s header', async (type, header) => {
      mockFetchWithCache.mockResolvedValue(unauthorized);
      const provider = createLiteLLMProvider(`litellm:${type}:test-model`, {
        config: { config: { headers: { [header]: 'explicit-credential' } } },
      });

      const result =
        type === 'embedding'
          ? await provider.callEmbeddingApi!('test')
          : await provider.callApi('test');

      expect(result.error).toContain('Authentication Error');
      expect(result.error).not.toContain('Set LITELLM_API_KEY');
      expect(mockFetchWithCache.mock.calls[0]?.[1]?.headers).toHaveProperty(
        header,
        'explicit-credential',
      );
    });

    it.each([
      ['https://user:pass@proxy.example/v1', 'https://user:pass@proxy.example/v1/chat/completions'],
      [
        'https://proxy.example/v1?api_key=explicit-value',
        'https://proxy.example/v1/chat/completions?api_key=explicit-value',
      ],
    ])(
      'does not append the key hint when the endpoint provides a credential',
      async (apiBaseUrl, requestUrl) => {
        mockFetchWithCache.mockResolvedValue(unauthorized);
        const provider = createLiteLLMProvider('litellm:chat:test-model', {
          config: { config: { apiBaseUrl } },
        });

        expect((await provider.callApi('test')).error).not.toContain('Set LITELLM_API_KEY');
        expect(mockFetchWithCache.mock.calls[0]?.[0]).toBe(requestUrl);
      },
    );

    it('still helps for ordinary metadata headers and a URL with a noncredential query', async () => {
      mockFetchWithCache.mockResolvedValue(unauthorized);
      const provider = createLiteLLMProvider('litellm:chat:test-model', {
        config: {
          config: {
            apiBaseUrl: 'https://proxy.example/v1?organization=example',
            headers: {
              Accept: 'application/json',
              'X-Request-ID': 'request-1',
              traceparent: 'trace-1',
              Authorization: '',
            },
          },
        },
      });

      expect((await provider.callApi('test')).error).toContain('Set LITELLM_API_KEY');
    });

    it('uses the chat prompt headers actually sent when explaining an auth failure', async () => {
      mockFetchWithCache.mockResolvedValue(unauthorized);
      const provider = createLiteLLMProvider('litellm:chat:test-model');
      const result = await provider.callApi('test', {
        vars: {},
        prompt: {
          raw: 'test',
          label: 'test',
          config: { headers: { 'x-api-key': 'prompt-credential' } },
        },
      });

      expect(result.error).not.toContain('Set LITELLM_API_KEY');
      expect(mockFetchWithCache.mock.calls[0]?.[1]?.headers).toHaveProperty(
        'x-api-key',
        'prompt-credential',
      );
    });
  });
});
