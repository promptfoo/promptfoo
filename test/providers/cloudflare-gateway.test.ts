import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, enableCache } from '../../src/cache';
import {
  CloudflareGatewayAnthropicProvider,
  type CloudflareGatewayConfig,
  CloudflareGatewayOpenAiProvider,
  createCloudflareGatewayProvider,
} from '../../src/providers/cloudflare-gateway';
import { loadApiProviders } from '../../src/providers/index';

import type { ProviderOptionsMap } from '../../src/types/index';

vi.mock('../../src/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/logger')>();
  return {
    ...actual,
    default: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('proxy-agent', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    ProxyAgent: vi.fn().mockImplementation(function () {
      return {};
    }),
  };
});

vi.mock('../../src/esm', async () => {
  const actual = await vi.importActual<typeof import('../../src/esm')>('../../src/esm');
  return {
    ...actual,
    importModule: vi.fn(),
  };
});

vi.mock('fs', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('glob', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    globSync: vi.fn(),
  };
});

vi.mock('../../src/database', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getDb: vi.fn(),
  };
});

const mockFetch = vi.mocked(vi.fn());
(global as typeof globalThis).fetch = mockFetch as unknown as typeof fetch;

const defaultMockResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    get: vi.fn().mockReturnValue(null),
    entries: vi.fn().mockReturnValue([]),
  },
};

describe('CloudflareGateway Provider', () => {
  beforeAll(() => {
    enableCache();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await clearCache();
  });

  const minimumConfig: Required<
    Pick<CloudflareGatewayConfig, 'accountId' | 'gatewayId' | 'apiKey'>
  > = {
    accountId: 'testAccountId',
    gatewayId: 'testGatewayId',
    apiKey: 'testApiKey',
  };

  const tokenUsageDefaultResponse = {
    total: 50,
    prompt: 25,
    completion: 25,
    numRequests: 1,
  };

  describe('createCloudflareGatewayProvider', () => {
    it('should create an OpenAI provider for openai type', () => {
      const provider = createCloudflareGatewayProvider('cloudflare-gateway:openai:gpt-4o', {
        config: minimumConfig,
      });

      expect(provider).toBeInstanceOf(CloudflareGatewayOpenAiProvider);
      expect(provider.id()).toBe('cloudflare-gateway:openai:gpt-4o');
    });

    it('should create an Anthropic provider for anthropic type', () => {
      const provider = createCloudflareGatewayProvider(
        'cloudflare-gateway:anthropic:claude-sonnet-4-20250514',
        {
          config: minimumConfig,
        },
      );

      expect(provider).toBeInstanceOf(CloudflareGatewayAnthropicProvider);
      expect(provider.id()).toBe('cloudflare-gateway:anthropic:claude-sonnet-4-20250514');
    });

    it('should create an OpenAI-compatible provider for groq', () => {
      const provider = createCloudflareGatewayProvider(
        'cloudflare-gateway:groq:llama-3.3-70b-versatile',
        {
          config: minimumConfig,
        },
      );

      expect(provider).toBeInstanceOf(CloudflareGatewayOpenAiProvider);
      expect(provider.id()).toBe('cloudflare-gateway:groq:llama-3.3-70b-versatile');
    });

    it('should throw error for invalid provider path format', () => {
      expect(() => createCloudflareGatewayProvider('cloudflare-gateway:openai', {})).toThrow(
        'Invalid cloudflare-gateway provider path',
      );
    });

    it('should throw error for unsupported provider', () => {
      expect(() =>
        createCloudflareGatewayProvider('cloudflare-gateway:unsupported:model', {
          config: minimumConfig,
        }),
      ).toThrow('Unsupported Cloudflare AI Gateway provider');
    });

    it('should throw error when accountId is missing', () => {
      expect(() =>
        createCloudflareGatewayProvider('cloudflare-gateway:openai:gpt-4o', {
          config: { gatewayId: 'test', apiKey: 'test' },
        }),
      ).toThrow('Cloudflare account ID required');
    });

    it('should throw error when gatewayId is missing', () => {
      expect(() =>
        createCloudflareGatewayProvider('cloudflare-gateway:openai:gpt-4o', {
          config: { accountId: 'test', apiKey: 'test' },
        }),
      ).toThrow('Cloudflare AI Gateway ID required');
    });

    it('should handle model names with colons', () => {
      const provider = createCloudflareGatewayProvider(
        'cloudflare-gateway:openai:gpt-4o:with:colons',
        {
          config: minimumConfig,
        },
      );

      expect(provider.id()).toBe('cloudflare-gateway:openai:gpt-4o:with:colons');
    });
  });

  describe('CloudflareGatewayOpenAiProvider', () => {
    it('should handle chat completion', async () => {
      const provider = new CloudflareGatewayOpenAiProvider('openai', 'gpt-4o', {
        config: minimumConfig,
      });

      const responsePayload = {
        choices: [
          {
            message: {
              content: 'Test response',
            },
          },
        ],
        usage: {
          total_tokens: 50,
          prompt_tokens: 25,
          completion_tokens: 25,
        },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      const result = await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test response');
      expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);
    });

    it('should construct correct gateway URL', async () => {
      const provider = new CloudflareGatewayOpenAiProvider('openai', 'gpt-4o', {
        config: minimumConfig,
      });

      const responsePayload = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };
      mockFetch.mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gateway.ai.cloudflare.com/v1/testAccountId/testGatewayId/openai/chat/completions',
        expect.any(Object),
      );
    });

    it('should construct correct gateway URL for groq provider', async () => {
      const provider = new CloudflareGatewayOpenAiProvider('groq', 'llama-3.3-70b-versatile', {
        config: minimumConfig,
      });

      const responsePayload = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };
      mockFetch.mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gateway.ai.cloudflare.com/v1/testAccountId/testGatewayId/groq/chat/completions',
        expect.any(Object),
      );
    });

    it('should add cf-aig-authorization header when token is provided', async () => {
      const provider = new CloudflareGatewayOpenAiProvider('openai', 'gpt-4o', {
        config: {
          ...minimumConfig,
          cfAigToken: 'test-token',
        },
      });

      const responsePayload = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };
      mockFetch.mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'cf-aig-authorization': 'Bearer test-token',
          }),
        }),
      );
    });

    it('should return correct id()', () => {
      const provider = new CloudflareGatewayOpenAiProvider('openai', 'gpt-4o', {
        config: minimumConfig,
      });

      expect(provider.id()).toBe('cloudflare-gateway:openai:gpt-4o');
    });

    it('should return correct toString()', () => {
      const provider = new CloudflareGatewayOpenAiProvider('openai', 'gpt-4o', {
        config: minimumConfig,
      });

      expect(provider.toString()).toBe('[Cloudflare AI Gateway openai Provider gpt-4o]');
    });

    it('should not expose API key in toJSON()', () => {
      const provider = new CloudflareGatewayOpenAiProvider('openai', 'gpt-4o', {
        config: minimumConfig,
      });

      const json = provider.toJSON();
      expect(json.config.apiKey).toBeUndefined();
      expect(json.provider).toBe('cloudflare-gateway');
      expect(json.underlyingProvider).toBe('openai');
      expect(json.model).toBe('gpt-4o');
    });
  });

  describe('CloudflareGatewayAnthropicProvider', () => {
    it('should return correct id()', () => {
      const provider = new CloudflareGatewayAnthropicProvider('claude-sonnet-4-20250514', {
        config: minimumConfig,
      });

      expect(provider.id()).toBe('cloudflare-gateway:anthropic:claude-sonnet-4-20250514');
    });

    it('should return correct toString()', () => {
      const provider = new CloudflareGatewayAnthropicProvider('claude-sonnet-4-20250514', {
        config: minimumConfig,
      });

      expect(provider.toString()).toBe(
        '[Cloudflare AI Gateway Anthropic Provider claude-sonnet-4-20250514]',
      );
    });

    it('should not expose API key in toJSON()', () => {
      const provider = new CloudflareGatewayAnthropicProvider('claude-sonnet-4-20250514', {
        config: minimumConfig,
      });

      const json = provider.toJSON();
      expect(json.config.apiKey).toBeUndefined();
      expect(json.provider).toBe('cloudflare-gateway');
      expect(json.underlyingProvider).toBe('anthropic');
      expect(json.model).toBe('claude-sonnet-4-20250514');
    });

    it('should construct correct gateway URL for Anthropic', async () => {
      const provider = new CloudflareGatewayAnthropicProvider('claude-sonnet-4-20250514', {
        config: minimumConfig,
      });

      const responsePayload = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Test' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 5 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };
      mockFetch.mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gateway.ai.cloudflare.com/v1/testAccountId/testGatewayId/anthropic/v1/messages',
        expect.any(Object),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle API error responses (4xx)', async () => {
      const provider = new CloudflareGatewayOpenAiProvider('openai', 'gpt-4o', {
        config: minimumConfig,
      });

      const errorPayload = {
        error: {
          message: 'Invalid API key',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      };
      const mockResponse = {
        ...defaultMockResponse,
        status: 401,
        statusText: 'Unauthorized',
        ok: false,
        text: vi.fn().mockResolvedValue(JSON.stringify(errorPayload)),
      };

      mockFetch.mockResolvedValue(mockResponse);
      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('401');
    });
  });

  describe('Config Passthrough', () => {
    it('should pass through temperature and max_tokens in request body', async () => {
      const provider = new CloudflareGatewayOpenAiProvider('openai', 'gpt-4o', {
        config: {
          ...minimumConfig,
          temperature: 0.8,
          max_tokens: 500,
        },
      });

      const responsePayload = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };
      mockFetch.mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.temperature).toBe(0.8);
      expect(requestBody.max_tokens).toBe(500);
    });

    it('should merge custom headers with gateway headers', async () => {
      const provider = new CloudflareGatewayOpenAiProvider('openai', 'gpt-4o', {
        config: {
          ...minimumConfig,
          cfAigToken: 'gateway-token',
          headers: { 'X-Custom-Header': 'custom-value' },
        },
      });

      const responsePayload = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };
      mockFetch.mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'cf-aig-authorization': 'Bearer gateway-token',
            'X-Custom-Header': 'custom-value',
          }),
        }),
      );
    });
  });

  describe('Provider Loading via loadApiProviders', () => {
    it('should load cloudflare-gateway:openai provider via loadApiProviders', async () => {
      const rawProviderConfigs: ProviderOptionsMap[] = [
        {
          'cloudflare-gateway:openai:gpt-4o': {
            config: minimumConfig,
          },
        },
      ];

      const providers = await loadApiProviders(rawProviderConfigs);
      expect(providers).toHaveLength(1);
      expect(providers[0].id()).toBe('cloudflare-gateway:openai:gpt-4o');
      expect(providers[0].toString()).toContain('Cloudflare AI Gateway');
    });

    it('should load cloudflare-gateway:anthropic provider via loadApiProviders', async () => {
      const rawProviderConfigs: ProviderOptionsMap[] = [
        {
          'cloudflare-gateway:anthropic:claude-sonnet-4-20250514': {
            config: minimumConfig,
          },
        },
      ];

      const providers = await loadApiProviders(rawProviderConfigs);
      expect(providers).toHaveLength(1);
      expect(providers[0].id()).toBe('cloudflare-gateway:anthropic:claude-sonnet-4-20250514');
      expect(providers[0].toString()).toContain('Cloudflare AI Gateway');
    });

    it('should load multiple cloudflare-gateway providers', async () => {
      const rawProviderConfigs: ProviderOptionsMap[] = [
        {
          'cloudflare-gateway:openai:gpt-4o': {
            config: minimumConfig,
          },
        },
        {
          'cloudflare-gateway:anthropic:claude-sonnet-4-20250514': {
            config: minimumConfig,
          },
        },
        {
          'cloudflare-gateway:groq:llama-3.3-70b-versatile': {
            config: minimumConfig,
          },
        },
      ];

      const providers = await loadApiProviders(rawProviderConfigs);
      expect(providers).toHaveLength(3);
      expect(providers[0].id()).toBe('cloudflare-gateway:openai:gpt-4o');
      expect(providers[1].id()).toBe('cloudflare-gateway:anthropic:claude-sonnet-4-20250514');
      expect(providers[2].id()).toBe('cloudflare-gateway:groq:llama-3.3-70b-versatile');
    });
  });

  describe('Supported Providers', () => {
    // Note: bedrock is NOT supported because it requires AWS request signing
    // azure-openai and workers-ai have special URL handling but are supported
    const supportedProviders = [
      'openai',
      'anthropic',
      'groq',
      'perplexity-ai',
      'google-ai-studio',
      'mistral',
      'cohere',
      'azure-openai',
      'workers-ai',
      'huggingface',
      'replicate',
      'grok',
    ];

    it.each(supportedProviders)('should support %s provider', (providerName) => {
      // azure-openai and workers-ai need extra config
      const extraConfig =
        providerName === 'azure-openai'
          ? { resourceName: 'test-resource', deploymentName: 'test-deployment' }
          : {};

      const provider = createCloudflareGatewayProvider(
        `cloudflare-gateway:${providerName}:test-model`,
        {
          config: { ...minimumConfig, ...extraConfig },
        },
      );

      expect(provider.id()).toBe(`cloudflare-gateway:${providerName}:test-model`);
    });

    it('should not support bedrock provider', () => {
      expect(() =>
        createCloudflareGatewayProvider('cloudflare-gateway:bedrock:anthropic.claude-v2', {
          config: minimumConfig,
        }),
      ).toThrow('Unsupported Cloudflare AI Gateway provider');
    });
  });

  describe('Environment Variable Support', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use environment variables for account ID and gateway ID', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'env-account-id';
      process.env.CLOUDFLARE_GATEWAY_ID = 'env-gateway-id';

      const provider = createCloudflareGatewayProvider('cloudflare-gateway:openai:gpt-4o', {
        config: { apiKey: 'test-key' },
      });

      expect(provider.id()).toBe('cloudflare-gateway:openai:gpt-4o');
    });

    it('should prefer config values over environment variables', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'env-account-id';
      process.env.CLOUDFLARE_GATEWAY_ID = 'env-gateway-id';

      const provider = new CloudflareGatewayOpenAiProvider('openai', 'gpt-4o', {
        config: {
          accountId: 'config-account-id',
          gatewayId: 'config-gateway-id',
          apiKey: 'test-key',
        },
      });

      expect(provider.id()).toBe('cloudflare-gateway:openai:gpt-4o');
    });

    it('should support custom environment variable names', () => {
      process.env.CUSTOM_ACCOUNT = 'custom-account-id';
      process.env.CUSTOM_GATEWAY = 'custom-gateway-id';

      const provider = createCloudflareGatewayProvider('cloudflare-gateway:openai:gpt-4o', {
        config: {
          accountIdEnvar: 'CUSTOM_ACCOUNT',
          gatewayIdEnvar: 'CUSTOM_GATEWAY',
          apiKey: 'test-key',
        },
      });

      expect(provider.id()).toBe('cloudflare-gateway:openai:gpt-4o');
    });
  });

  describe('Azure OpenAI Provider', () => {
    it('should require resourceName for azure-openai', () => {
      expect(() =>
        createCloudflareGatewayProvider('cloudflare-gateway:azure-openai:gpt-4', {
          config: {
            ...minimumConfig,
            deploymentName: 'my-deployment',
          },
        }),
      ).toThrow('Azure OpenAI requires resourceName');
    });

    it('should require deploymentName for azure-openai', () => {
      expect(() =>
        createCloudflareGatewayProvider('cloudflare-gateway:azure-openai:gpt-4', {
          config: {
            ...minimumConfig,
            resourceName: 'my-resource',
          },
        }),
      ).toThrow('Azure OpenAI requires deploymentName');
    });

    it('should require API key for azure-openai', () => {
      // Clear the environment variable to ensure validation triggers
      const originalAzureKey = process.env.AZURE_OPENAI_API_KEY;
      delete process.env.AZURE_OPENAI_API_KEY;

      try {
        expect(() =>
          createCloudflareGatewayProvider('cloudflare-gateway:azure-openai:gpt-4', {
            config: {
              accountId: 'testAccountId',
              gatewayId: 'testGatewayId',
              resourceName: 'my-resource',
              deploymentName: 'my-deployment',
              // No apiKey provided
            },
          }),
        ).toThrow('Azure OpenAI API key is required');
      } finally {
        // Restore the environment variable
        if (originalAzureKey !== undefined) {
          process.env.AZURE_OPENAI_API_KEY = originalAzureKey;
        }
      }
    });

    it('should construct correct URL with resourceName and deploymentName', async () => {
      const provider = new CloudflareGatewayOpenAiProvider('azure-openai', 'gpt-4', {
        config: {
          ...minimumConfig,
          resourceName: 'my-resource',
          deploymentName: 'my-deployment',
        },
      });

      const responsePayload = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };
      mockFetch.mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://gateway.ai.cloudflare.com/v1/testAccountId/testGatewayId/azure-openai/my-resource/my-deployment',
        ),
        expect.any(Object),
      );
    });

    it('should include api-version query parameter', async () => {
      const provider = new CloudflareGatewayOpenAiProvider('azure-openai', 'gpt-4', {
        config: {
          ...minimumConfig,
          resourceName: 'my-resource',
          deploymentName: 'my-deployment',
          apiVersion: '2024-06-01',
        },
      });

      const responsePayload = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };
      mockFetch.mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api-version=2024-06-01'),
        expect.any(Object),
      );
    });
  });

  describe('Workers AI Provider', () => {
    it('should construct correct URL with model in path', async () => {
      const provider = new CloudflareGatewayOpenAiProvider(
        'workers-ai',
        '@cf/meta/llama-3.1-8b-instruct',
        {
          config: minimumConfig,
        },
      );

      const responsePayload = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };
      mockFetch.mockResolvedValue(mockResponse);

      await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://gateway.ai.cloudflare.com/v1/testAccountId/testGatewayId/workers-ai/@cf/meta/llama-3.1-8b-instruct',
        ),
        expect.any(Object),
      );
    });

    it('should return correct id for workers-ai provider', () => {
      const provider = new CloudflareGatewayOpenAiProvider(
        'workers-ai',
        '@cf/meta/llama-3.1-8b-instruct',
        {
          config: minimumConfig,
        },
      );

      expect(provider.id()).toBe('cloudflare-gateway:workers-ai:@cf/meta/llama-3.1-8b-instruct');
    });
  });
});
