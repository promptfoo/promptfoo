import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import {
  HuggingfaceChatCompletionProvider,
  HuggingfaceTextGenerationProvider,
} from '../../src/providers/huggingface';
import { loadApiProvider } from '../../src/providers/index';

vi.mock('proxy-agent', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    ProxyAgent: vi.fn().mockImplementation(function () {
      return {};
    }),
  };
});

vi.mock('../../src/database', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getDb: vi.fn(),
  };
});

vi.mock('../../src/globalConfig/cloud', () => {
  return {
    CLOUD_API_HOST: 'https://api.promptfoo.app',
    API_HOST: 'https://api.promptfoo.app',
    CloudConfig: vi.fn(),
    cloudConfig: {
      isEnabled: vi.fn().mockReturnValue(false),
      getApiHost: vi.fn().mockReturnValue('https://api.promptfoo.dev'),
      getApiKey: vi.fn().mockReturnValue('test-api-key'),
    },
  };
});

vi.mock('../../src/util/cloud', async () => ({
  ...(await vi.importActual('../../src/util/cloud')),
  getProviderFromCloud: vi.fn(),
  validateLinkedTargetId: vi.fn(),
}));

const mockFetch = vi.mocked(vi.fn());
global.fetch = mockFetch;

const defaultMockResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    get: vi.fn().mockReturnValue(null),
    entries: vi.fn().mockReturnValue([]),
  },
};

function mockChatResponse(content: string, usage?: object) {
  return {
    ...defaultMockResponse,
    text: vi.fn().mockResolvedValue(
      JSON.stringify({
        choices: [{ message: { content } }],
        ...(usage && { usage }),
      }),
    ),
  };
}

function mockErrorResponse(statusCode: number, errorMessage: string) {
  return {
    status: statusCode,
    statusText: statusCode === 429 ? 'Too Many Requests' : 'Error',
    headers: {
      get: vi.fn().mockReturnValue(null),
      entries: vi.fn().mockReturnValue([]),
    },
    text: vi.fn().mockResolvedValue(
      JSON.stringify({
        error: { message: errorMessage },
      }),
    ),
  };
}

describe('HuggingfaceChatCompletionProvider', () => {
  beforeEach(() => {
    process.env.HF_TOKEN = 'test-hf-token';
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await clearCache();
    delete process.env.HF_TOKEN;
    delete process.env.HF_API_TOKEN;
  });

  describe('constructor and identity', () => {
    it('returns correct id', () => {
      const provider = new HuggingfaceChatCompletionProvider('meta-llama/Llama-3.3-70B-Instruct');
      expect(provider.id()).toBe('huggingface:chat:meta-llama/Llama-3.3-70B-Instruct');
    });

    it('returns correct toString', () => {
      const provider = new HuggingfaceChatCompletionProvider('meta-llama/Llama-3.3-70B-Instruct');
      expect(provider.toString()).toBe(
        '[HuggingFace Chat Provider meta-llama/Llama-3.3-70B-Instruct]',
      );
    });

    it('uses default HuggingFace API base URL', () => {
      const provider = new HuggingfaceChatCompletionProvider('test-model');
      expect(provider.getApiUrlDefault()).toBe('https://router.huggingface.co/v1');
    });

    it('appends inferenceProvider config to model name', () => {
      const provider = new HuggingfaceChatCompletionProvider('Qwen/QwQ-32B', {
        config: { inferenceProvider: 'featherless-ai' },
      });
      expect(provider.id()).toBe('huggingface:chat:Qwen/QwQ-32B:featherless-ai');
    });

    it('does not duplicate provider suffix if already in model name', () => {
      const provider = new HuggingfaceChatCompletionProvider('Qwen/QwQ-32B:featherless-ai', {
        config: { inferenceProvider: 'together' },
      });
      // Model name already contains ':', so inferenceProvider is ignored
      expect(provider.id()).toBe('huggingface:chat:Qwen/QwQ-32B:featherless-ai');
    });

    it('passes provider suffix to API request model field', async () => {
      mockFetch.mockResolvedValue(mockChatResponse('4'));
      const provider = new HuggingfaceChatCompletionProvider('Qwen/QwQ-32B', {
        config: { inferenceProvider: 'featherless-ai' },
      });
      await provider.callApi('test');
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.model).toBe('Qwen/QwQ-32B:featherless-ai');
    });
  });

  describe('API key handling', () => {
    it('uses config.apiKey first', () => {
      const provider = new HuggingfaceChatCompletionProvider('test-model', {
        config: { apiKey: 'config-key' },
      });
      expect(provider.getApiKey()).toBe('config-key');
    });

    it('falls back to HF_TOKEN env var', () => {
      process.env.HF_TOKEN = 'env-hf-token';
      const provider = new HuggingfaceChatCompletionProvider('test-model');
      expect(provider.getApiKey()).toBe('env-hf-token');
    });

    it('falls back to HF_API_TOKEN env var', () => {
      delete process.env.HF_TOKEN;
      process.env.HF_API_TOKEN = 'env-hf-api-token';
      const provider = new HuggingfaceChatCompletionProvider('test-model');
      expect(provider.getApiKey()).toBe('env-hf-api-token');
    });

    it('uses provider-level env overrides for HF_TOKEN', () => {
      delete process.env.HF_TOKEN;
      delete process.env.HF_API_TOKEN;
      const provider = new HuggingfaceChatCompletionProvider('test-model', {
        env: { HF_TOKEN: 'env-override-token' },
      });
      expect(provider.getApiKey()).toBe('env-override-token');
    });

    it('uses provider-level env overrides for HF_API_TOKEN', () => {
      delete process.env.HF_TOKEN;
      delete process.env.HF_API_TOKEN;
      const provider = new HuggingfaceChatCompletionProvider('test-model', {
        env: { HF_API_TOKEN: 'env-override-api-token' },
      });
      expect(provider.getApiKey()).toBe('env-override-api-token');
    });

    it('returns undefined when no key is set', () => {
      delete process.env.HF_TOKEN;
      delete process.env.HF_API_TOKEN;
      const provider = new HuggingfaceChatCompletionProvider('test-model');
      expect(provider.getApiKey()).toBeUndefined();
    });

    it('throws helpful error when API key is missing', async () => {
      delete process.env.HF_TOKEN;
      delete process.env.HF_API_TOKEN;
      const provider = new HuggingfaceChatCompletionProvider('test-model');
      await expect(provider.callApi('test')).rejects.toThrow('HF_TOKEN');
    });
  });

  describe('URL handling', () => {
    it('strips /chat/completions from apiBaseUrl', async () => {
      mockFetch.mockResolvedValue(mockChatResponse('response'));
      const provider = new HuggingfaceChatCompletionProvider('test-model', {
        config: { apiBaseUrl: 'https://custom.endpoint.co/v1/chat/completions' },
      });
      await provider.callApi('test');
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.endpoint.co/v1/chat/completions');
      expect(url).not.toContain('/chat/completions/chat/completions');
    });

    it('strips /chat/completions from apiEndpoint', async () => {
      mockFetch.mockResolvedValue(mockChatResponse('response'));
      const provider = new HuggingfaceChatCompletionProvider('test-model', {
        config: { apiEndpoint: 'https://router.huggingface.co/v1/chat/completions' },
      });
      await provider.callApi('test');
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://router.huggingface.co/v1/chat/completions');
    });

    it('uses default URL when no custom endpoint is provided', async () => {
      mockFetch.mockResolvedValue(mockChatResponse('response'));
      const provider = new HuggingfaceChatCompletionProvider('test-model');
      await provider.callApi('test');
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://router.huggingface.co/v1/chat/completions');
    });
  });

  describe('parameter mapping', () => {
    it('maps max_new_tokens to max_tokens', async () => {
      mockFetch.mockResolvedValue(mockChatResponse('response'));
      const provider = new HuggingfaceChatCompletionProvider('test-model', {
        config: { max_new_tokens: 200 },
      });
      await provider.callApi('test');
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.max_tokens).toBe(200);
    });

    it('does not override explicit max_tokens with max_new_tokens', async () => {
      mockFetch.mockResolvedValue(mockChatResponse('response'));
      const provider = new HuggingfaceChatCompletionProvider('test-model', {
        config: { max_new_tokens: 200, max_tokens: 500 },
      });
      await provider.callApi('test');
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.max_tokens).toBe(500);
    });

    it('passes temperature and top_p through', async () => {
      mockFetch.mockResolvedValue(mockChatResponse('response'));
      const provider = new HuggingfaceChatCompletionProvider('test-model', {
        config: { temperature: 0.7, top_p: 0.9 },
      });
      await provider.callApi('test');
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.temperature).toBe(0.7);
      expect(body.top_p).toBe(0.9);
    });
  });

  describe('API calls', () => {
    it('sends correct chat completion request', async () => {
      mockFetch.mockResolvedValue(
        mockChatResponse('Hello!', { total_tokens: 15, prompt_tokens: 5, completion_tokens: 10 }),
      );
      const provider = new HuggingfaceChatCompletionProvider('deepseek-ai/DeepSeek-R1');
      const result = await provider.callApi('Hi there');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://router.huggingface.co/v1/chat/completions');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('deepseek-ai/DeepSeek-R1');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hi there' }]);

      expect(result.output).toBe('Hello!');
      expect(result.tokenUsage).toMatchObject({ total: 15, prompt: 5, completion: 10 });
    });

    it('sends Authorization header with HF token', async () => {
      process.env.HF_TOKEN = 'my-secret-token';
      mockFetch.mockResolvedValue(mockChatResponse('response'));
      const provider = new HuggingfaceChatCompletionProvider('test-model');
      await provider.callApi('test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer my-secret-token');
    });

    it('handles structured message input', async () => {
      mockFetch.mockResolvedValue(mockChatResponse('response'));
      const provider = new HuggingfaceChatCompletionProvider('test-model');
      const messages = JSON.stringify([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ]);
      await provider.callApi(messages);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ]);
    });
  });

  describe('error handling', () => {
    it('handles API error in response body', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(400, 'Model not found'));
      const provider = new HuggingfaceChatCompletionProvider('nonexistent-model');
      const result = await provider.callApi('test');
      expect(result.error).toContain('Model not found');
    });

    it('handles 500 server error response', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(500, 'Internal server error'));
      const provider = new HuggingfaceChatCompletionProvider('test-model');
      const result = await provider.callApi('test');
      expect(result.error).toBeDefined();
    });

    it('handles empty response', async () => {
      mockFetch.mockResolvedValue({
        ...defaultMockResponse,
        text: vi.fn().mockResolvedValue(JSON.stringify({ choices: [] })),
      });
      const provider = new HuggingfaceChatCompletionProvider('test-model');
      const result = await provider.callApi('test');
      expect(result.error).toBeDefined();
    });
  });
});

describe('HuggingfaceTextGenerationProvider chat delegation', () => {
  beforeEach(() => {
    process.env.HF_TOKEN = 'test-hf-token';
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await clearCache();
    delete process.env.HF_TOKEN;
  });

  it('auto-detects chat completion format from /v1/chat URL', async () => {
    mockFetch.mockResolvedValue(mockChatResponse('Chat response'));
    const provider = new HuggingfaceTextGenerationProvider('deepseek-ai/DeepSeek-R1', {
      config: {
        apiEndpoint: 'https://router.huggingface.co/v1/chat/completions',
        apiKey: 'test-key',
      },
    });
    const result = await provider.callApi('Test prompt');

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://router.huggingface.co/v1/chat/completions');
    const body = JSON.parse(options.body);
    expect(body).toHaveProperty('messages');
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Test prompt' });
    expect(result.output).toBe('Chat response');
  });

  it('does NOT auto-detect chat format for /v1/completions endpoint', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: vi.fn().mockResolvedValue(JSON.stringify({ generated_text: 'Output' })),
    };
    mockFetch.mockResolvedValue(mockResponse);
    const provider = new HuggingfaceTextGenerationProvider('model', {
      config: { apiEndpoint: 'https://api.example.com/v1/completions' },
    });
    await provider.callApi('Test');

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toHaveProperty('inputs');
    expect(body).not.toHaveProperty('messages');
  });

  it('uses explicit chatCompletion: true config', async () => {
    mockFetch.mockResolvedValue(mockChatResponse('Chat response'));
    const provider = new HuggingfaceTextGenerationProvider('my-model', {
      config: {
        apiEndpoint: 'https://my-custom-endpoint.com/api',
        chatCompletion: true,
      },
    });
    const result = await provider.callApi('Test prompt');

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toHaveProperty('messages');
    expect(result.output).toBe('Chat response');
  });

  it('falls back to Inference API when chatCompletion is false', async () => {
    const mockResponse = {
      ...defaultMockResponse,
      text: vi.fn().mockResolvedValue(JSON.stringify({ generated_text: 'Output' })),
    };
    mockFetch.mockResolvedValue(mockResponse);
    const provider = new HuggingfaceTextGenerationProvider('model', {
      config: {
        apiEndpoint: 'https://api.example.com/v1/chat/completions',
        chatCompletion: false,
      },
    });
    await provider.callApi('Test');

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toHaveProperty('inputs');
    expect(body).not.toHaveProperty('messages');
  });

  it('maps HuggingFace parameters to OpenAI format when delegating', async () => {
    mockFetch.mockResolvedValue(mockChatResponse('Response'));
    const provider = new HuggingfaceTextGenerationProvider('model', {
      config: {
        apiEndpoint: 'https://api.example.com/v1/chat/completions',
        temperature: 0.7,
        top_p: 0.9,
        max_new_tokens: 100,
      },
    });
    await provider.callApi('Test');

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
    expect(body.max_tokens).toBe(100);
  });

  it('forwards cleanup to inner chat provider', async () => {
    mockFetch.mockResolvedValue(mockChatResponse('response'));
    const provider = new HuggingfaceTextGenerationProvider('model', {
      config: {
        apiEndpoint: 'https://api.example.com/v1/chat/completions',
      },
    });
    // Trigger lazy creation of inner chat provider
    await provider.callApi('test');
    // cleanup should not throw even when inner provider has no MCP
    await expect(provider.cleanup()).resolves.toBeUndefined();
  });

  it('cleanup is safe when no chat provider was created', async () => {
    const provider = new HuggingfaceTextGenerationProvider('model', {
      config: {},
    });
    await expect(provider.cleanup()).resolves.toBeUndefined();
  });
});

describe('provider registry integration', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    await clearCache();
  });

  it('loads huggingface:chat provider from registry', async () => {
    const provider = await loadApiProvider('huggingface:chat:meta-llama/Llama-3.3-70B-Instruct');
    expect(provider).toBeInstanceOf(HuggingfaceChatCompletionProvider);
    expect(provider.id()).toBe('huggingface:chat:meta-llama/Llama-3.3-70B-Instruct');
  });

  it('loads huggingface:text-generation provider from registry', async () => {
    const provider = await loadApiProvider(
      'huggingface:text-generation:meta-llama/Llama-3.3-70B-Instruct',
    );
    expect(provider).toBeInstanceOf(HuggingfaceTextGenerationProvider);
  });

  it('throws for invalid huggingface provider path', async () => {
    await expect(loadApiProvider('huggingface:invalid')).rejects.toThrow(
      'Invalid Huggingface provider path',
    );
  });

  it('passes provider options to huggingface:chat', async () => {
    const provider = await loadApiProvider('huggingface:chat:test-model', {
      options: { config: { temperature: 0.5 } },
    });
    expect(provider).toBeInstanceOf(HuggingfaceChatCompletionProvider);
  });
});
