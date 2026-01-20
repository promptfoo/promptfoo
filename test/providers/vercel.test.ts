import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../src/cache';
import {
  createVercelProvider,
  VercelAiEmbeddingProvider,
  VercelAiProvider,
} from '../../src/providers/vercel';

// Mock the cache module
vi.mock('../../src/cache', async () => ({
  ...(await vi.importActual('../../src/cache')),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));

// Mock the ai SDK module
vi.mock('ai', () => {
  const createGatewayMock = vi.fn(() => {
    const gateway = Object.assign(
      vi.fn((modelName: string) => ({ modelName })),
      {
        textEmbeddingModel: vi.fn((modelName: string) => ({ modelName, type: 'embedding' })),
      },
    );
    return gateway;
  });
  return {
    createGateway: createGatewayMock,
    generateText: vi.fn(),
    streamText: vi.fn(),
    generateObject: vi.fn(),
    embed: vi.fn(),
    jsonSchema: vi.fn((schema: unknown) => schema),
  };
});

describe('VercelAiProvider', () => {
  let mockCache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset cache mock
    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getCache).mockResolvedValue(mockCache as any);
    vi.mocked(isCacheEnabled).mockReturnValue(false);

    // Reset ai module mocks
    const { generateText, streamText, generateObject, embed } = await import('ai');
    vi.mocked(generateText).mockReset();
    vi.mocked(streamText).mockReset();
    vi.mocked(generateObject).mockReset();
    vi.mocked(embed).mockReset();
  });

  describe('constructor', () => {
    it('should create a provider with default options', () => {
      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      expect(provider.modelName).toBe('openai/gpt-4o-mini');
      expect(provider.config).toEqual({});
    });

    it('should create a provider with custom options', () => {
      const provider = new VercelAiProvider('anthropic/claude-sonnet-4.5', {
        config: { temperature: 0.7, maxTokens: 1024 },
      });
      expect(provider.modelName).toBe('anthropic/claude-sonnet-4.5');
      expect(provider.config).toEqual({ temperature: 0.7, maxTokens: 1024 });
    });
  });

  describe('id()', () => {
    it('should return correct provider id', () => {
      const provider = new VercelAiProvider('openai/gpt-4o');
      expect(provider.id()).toBe('vercel:openai/gpt-4o');
    });

    it('should use custom id if provided', () => {
      const provider = new VercelAiProvider('openai/gpt-4o', {
        id: 'custom-vercel-provider',
      });
      expect(provider.id()).toBe('custom-vercel-provider');
    });
  });

  describe('toString()', () => {
    it('should return correct string representation', () => {
      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      expect(provider.toString()).toBe('[Vercel AI Gateway Provider openai/gpt-4o-mini]');
    });
  });

  describe('configuration options', () => {
    it('should store apiKeyEnvar in config', () => {
      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { apiKeyEnvar: 'MY_CUSTOM_API_KEY' },
      });
      expect(provider.config.apiKeyEnvar).toBe('MY_CUSTOM_API_KEY');
    });

    it('should store headers in config', () => {
      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { headers: { 'X-Custom-Header': 'test-value' } },
      });
      expect(provider.config.headers).toEqual({ 'X-Custom-Header': 'test-value' });
    });

    it('should store baseUrl in config', () => {
      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { baseUrl: 'https://custom-gateway.example.com' },
      });
      expect(provider.config.baseUrl).toBe('https://custom-gateway.example.com');
    });

    it('should store all config options together', () => {
      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          apiKey: 'test-key',
          apiKeyEnvar: 'MY_API_KEY',
          baseUrl: 'https://custom.example.com',
          headers: { 'X-Test': 'value' },
          temperature: 0.5,
          maxTokens: 1000,
          topP: 0.9,
          topK: 40,
          frequencyPenalty: 0.1,
          presencePenalty: 0.2,
          stopSequences: ['\n\n'],
          timeout: 30000,
          streaming: true,
          responseSchema: { type: 'object' },
        },
      });
      expect(provider.config).toEqual({
        apiKey: 'test-key',
        apiKeyEnvar: 'MY_API_KEY',
        baseUrl: 'https://custom.example.com',
        headers: { 'X-Test': 'value' },
        temperature: 0.5,
        maxTokens: 1000,
        topP: 0.9,
        topK: 40,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        stopSequences: ['\n\n'],
        timeout: 30000,
        streaming: true,
        responseSchema: { type: 'object' },
      });
    });
  });

  describe('callApi() - non-streaming', () => {
    it('should return text response', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Hello from GPT-4o!',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        output: 'Hello from GPT-4o!',
        tokenUsage: {
          prompt: 10,
          completion: 20,
          total: 30,
          numRequests: 1,
        },
        finishReason: 'stop',
      });
    });

    it('should include token usage', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Response',
        usage: { promptTokens: 5, completionTokens: 15, totalTokens: 20 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o');
      const result = await provider.callApi('Test');

      expect(result.tokenUsage).toEqual({
        prompt: 5,
        completion: 15,
        total: 20,
        numRequests: 1,
      });
    });

    it('should parse JSON chat messages from prompt', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Response to chat',
        usage: { promptTokens: 10, completionTokens: 15 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o');
      const chatPrompt = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ]);
      await provider.callApi(chatPrompt);

      expect(vi.mocked(generateText)).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello!' },
          ],
        }),
      );
    });

    it('should pass config options to generateText', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Response',
        usage: { promptTokens: 5, completionTokens: 10 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          temperature: 0.8,
          maxTokens: 500,
          topP: 0.9,
        },
      });
      await provider.callApi('Test');

      expect(vi.mocked(generateText)).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Test' }],
          temperature: 0.8,
          maxTokens: 500,
          topP: 0.9,
        }),
      );
    });

    it('should handle errors gracefully', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        error: 'API call error: API rate limit exceeded',
      });
    });

    it('should handle timeout errors', async () => {
      const { generateText } = await import('ai');
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.mocked(generateText).mockRejectedValueOnce(abortError);

      const provider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: { timeout: 5000 },
      });
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        error: 'Request timed out after 5000ms',
      });
    });
  });

  describe('callApi() - streaming', () => {
    it('should handle streaming responses', async () => {
      const { streamText } = await import('ai');

      // Mock async generator for textStream
      async function* mockTextStream() {
        yield 'Hello ';
        yield 'from ';
        yield 'streaming!';
      }

      vi.mocked(streamText).mockReturnValueOnce({
        textStream: mockTextStream(),
        usage: Promise.resolve({ promptTokens: 5, completionTokens: 15, totalTokens: 20 }),
        finishReason: Promise.resolve('stop'),
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { streaming: true },
      });
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        output: 'Hello from streaming!',
        tokenUsage: {
          prompt: 5,
          completion: 15,
          total: 20,
          numRequests: 1,
        },
        finishReason: 'stop',
      });
    });

    it('should pass config options to streamText', async () => {
      const { streamText } = await import('ai');

      async function* mockTextStream() {
        yield 'Response';
      }

      vi.mocked(streamText).mockReturnValueOnce({
        textStream: mockTextStream(),
        usage: Promise.resolve({ promptTokens: 5, completionTokens: 10 }),
        finishReason: Promise.resolve('stop'),
      } as any);

      const provider = new VercelAiProvider('anthropic/claude-sonnet-4.5', {
        config: {
          streaming: true,
          temperature: 0.5,
          maxTokens: 1000,
        },
      });
      await provider.callApi('Test');

      expect(vi.mocked(streamText)).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Test' }],
          temperature: 0.5,
          maxTokens: 1000,
        }),
      );
    });

    it('should handle streaming errors', async () => {
      const { streamText } = await import('ai');
      vi.mocked(streamText).mockImplementationOnce(() => {
        throw new Error('Stream connection failed');
      });

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { streaming: true },
      });
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        error: 'API call error: Stream connection failed',
      });
    });

    it('should handle streaming timeout errors', async () => {
      const { streamText } = await import('ai');
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.mocked(streamText).mockImplementationOnce(() => {
        throw abortError;
      });

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { streaming: true, timeout: 10000 },
      });
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        error: 'Request timed out after 10000ms',
      });
    });
  });

  describe('caching', () => {
    it('should return cached response when available', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      mockCache.get.mockResolvedValueOnce(
        JSON.stringify({
          output: 'Cached response',
          tokenUsage: { prompt: 5, completion: 10, total: 15 },
          finishReason: 'stop',
        }),
      );

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        output: 'Cached response',
        tokenUsage: { prompt: 5, completion: 10, total: 15 },
        finishReason: 'stop',
        cached: true,
      });
    });

    it('should cache response after successful API call', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Fresh response',
        usage: { promptTokens: 10, completionTokens: 20 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      await provider.callApi('Hello');

      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Fresh response'),
      );
    });

    it('should not cache error responses', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockRejectedValueOnce(new Error('API error'));

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      await provider.callApi('Hello');

      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should bypass cache when bustCache is true', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      mockCache.get.mockResolvedValueOnce(
        JSON.stringify({
          output: 'Cached response',
        }),
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Fresh response',
        usage: { promptTokens: 10, completionTokens: 20 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      const result = await provider.callApi('Hello', { bustCache: true } as any);

      expect(result.output).toBe('Fresh response');
      expect(result.cached).toBeUndefined();
    });
  });

  describe('callApi() - structured output', () => {
    it('should return object response with schema', async () => {
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: { sentiment: 'positive', confidence: 0.95 },
        usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          responseSchema: {
            type: 'object',
            properties: {
              sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
              confidence: { type: 'number' },
            },
            required: ['sentiment', 'confidence'],
          },
        },
      });
      const result = await provider.callApi('Analyze this text');

      expect(result).toEqual({
        output: { sentiment: 'positive', confidence: 0.95 },
        tokenUsage: {
          prompt: 15,
          completion: 25,
          total: 40,
          numRequests: 1,
        },
        finishReason: 'stop',
      });
    });

    it('should pass schema to generateObject', async () => {
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: { name: 'Test', value: 42 },
        usage: { promptTokens: 10, completionTokens: 20 },
        finishReason: 'stop',
      } as any);

      const testSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'number' },
        },
      };

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          responseSchema: testSchema,
          temperature: 0.5,
        },
      });
      await provider.callApi('Generate data');

      expect(vi.mocked(generateObject)).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Generate data' }],
          // OpenAI requires additionalProperties: false, so provider auto-adds it
          schema: { ...testSchema, additionalProperties: false },
          temperature: 0.5,
        }),
      );
    });

    it('should handle structured output errors', async () => {
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockRejectedValueOnce(new Error('Schema validation failed'));

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          responseSchema: {
            type: 'object',
            properties: { data: { type: 'string' } },
          },
        },
      });
      const result = await provider.callApi('Generate data');

      expect(result).toEqual({
        error: 'API call error: Schema validation failed',
      });
    });

    it('should handle structured output timeout errors', async () => {
      const { generateObject } = await import('ai');
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.mocked(generateObject).mockRejectedValueOnce(abortError);

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          responseSchema: { type: 'object', properties: {} },
          timeout: 8000,
        },
      });
      const result = await provider.callApi('Generate data');

      expect(result).toEqual({
        error: 'Request timed out after 8000ms',
      });
    });

    it('should prioritize structured output over streaming', async () => {
      const { generateObject, streamText } = await import('ai');
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: { result: 'structured' },
        usage: { promptTokens: 10, completionTokens: 15 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          streaming: true,
          responseSchema: { type: 'object', properties: { result: { type: 'string' } } },
        },
      });
      const result = await provider.callApi('Test');

      expect(vi.mocked(generateObject)).toHaveBeenCalled();
      expect(vi.mocked(streamText)).not.toHaveBeenCalled();
      expect(result.output).toEqual({ result: 'structured' });
    });
  });
});

describe('VercelAiEmbeddingProvider', () => {
  let mockCache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getCache).mockResolvedValue(mockCache as any);
    vi.mocked(isCacheEnabled).mockReturnValue(false);

    const { embed } = await import('ai');
    vi.mocked(embed).mockReset();
  });

  describe('constructor', () => {
    it('should create a provider with default options', () => {
      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      expect(provider.modelName).toBe('openai/text-embedding-3-small');
      expect(provider.config).toEqual({});
    });
  });

  describe('id()', () => {
    it('should return correct provider id', () => {
      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      expect(provider.id()).toBe('vercel:embedding:openai/text-embedding-3-small');
    });
  });

  describe('toString()', () => {
    it('should return correct string representation', () => {
      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      expect(provider.toString()).toBe(
        '[Vercel AI Gateway Embedding Provider openai/text-embedding-3-small]',
      );
    });
  });

  describe('callApi()', () => {
    it('should return error for callApi on embedding provider', async () => {
      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      const result = await provider.callApi('test');

      expect(result).toEqual({
        error: 'Use callEmbeddingApi for embedding models',
      });
    });
  });

  describe('callEmbeddingApi()', () => {
    it('should return embedding vector', async () => {
      const { embed } = await import('ai');
      vi.mocked(embed).mockResolvedValueOnce({
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        usage: { tokens: 10 },
      } as any);

      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      const result = await provider.callEmbeddingApi('Test text');

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        tokenUsage: {
          total: 10,
        },
      });
    });

    it('should handle API errors', async () => {
      const { embed } = await import('ai');
      vi.mocked(embed).mockRejectedValueOnce(new Error('Embedding API error'));

      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      const result = await provider.callEmbeddingApi('Test text');

      expect(result).toEqual({
        error: 'API call error: Embedding API error',
      });
    });

    it('should cache embedding responses', async () => {
      const { embed } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(embed).mockResolvedValueOnce({
        embedding: [0.1, 0.2, 0.3],
        usage: { tokens: 5 },
      } as any);

      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      await provider.callEmbeddingApi('Test text');

      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('vercel:embedding:'),
        expect.any(String),
      );
    });

    it('should return cached embedding when available', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      mockCache.get.mockResolvedValueOnce(
        JSON.stringify({
          embedding: [0.5, 0.6, 0.7],
          tokenUsage: { total: 8 },
        }),
      );

      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      const result = await provider.callEmbeddingApi('Test text');

      expect(result).toEqual({
        embedding: [0.5, 0.6, 0.7],
        tokenUsage: { total: 8 },
        cached: true,
      });
    });
  });
});

describe('createVercelProvider', () => {
  it('should create text generation provider for standard path', () => {
    const provider = createVercelProvider('vercel:openai/gpt-4o-mini');
    expect(provider).toBeInstanceOf(VercelAiProvider);
    expect(provider.id()).toBe('vercel:openai/gpt-4o-mini');
  });

  it('should create embedding provider for embedding path', () => {
    const provider = createVercelProvider('vercel:embedding:openai/text-embedding-3-small');
    expect(provider).toBeInstanceOf(VercelAiEmbeddingProvider);
    expect(provider.id()).toBe('vercel:embedding:openai/text-embedding-3-small');
  });

  it('should pass options to created provider', () => {
    const provider = createVercelProvider('vercel:openai/gpt-4o', {
      config: { temperature: 0.5 },
    }) as VercelAiProvider;
    expect(provider.config.temperature).toBe(0.5);
  });
});
