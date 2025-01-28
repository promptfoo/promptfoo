import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth';
import { getCache, isCacheEnabled, clearCache } from '../../src/cache';
import logger from '../../src/logger';
import { VertexChatProvider, VertexEmbeddingProvider } from '../../src/providers/vertex';
import * as vertexUtil from '../../src/providers/vertexUtil';
import { loadApiProvider } from '../../src/providers';

jest.mock('../../src/cache', () => ({
  getCache: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
  }),
  isCacheEnabled: jest.fn(),
  clearCache: jest.fn(),
}));

jest.mock('../../src/providers/vertexUtil', () => ({
  ...jest.requireActual('../../src/providers/vertexUtil'),
  getGoogleClient: jest.fn(),
}));

jest.mock('../../src/logger');

describe('VertexChatProvider.callGeminiApi', () => {
  let provider: VertexChatProvider;

  beforeEach(() => {
    provider = new VertexChatProvider('gemini-pro', {
      config: {
        context: 'test-context',
        examples: [{ input: 'example input', output: 'example output' }],
        stopSequence: ['\n'],
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 0.9,
        topK: 40,
      },
    });
    jest.mocked(getCache).mockReturnValue({
      get: jest.fn(),
      set: jest.fn(),
      wrap: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
      store: {} as any,
    });

    jest.mocked(isCacheEnabled).mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call the Gemini API and return the response', async () => {
    const mockResponse = {
      data: [
        {
          candidates: [{ content: { parts: [{ text: 'response text' }] } }],
          usageMetadata: {
            totalTokenCount: 10,
            promptTokenCount: 5,
            candidatesTokenCount: 5,
          },
        },
      ],
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    const response = await provider.callGeminiApi('test prompt');

    expect(response).toEqual({
      cached: false,
      output: 'response text',
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
    });

    expect(vertexUtil.getGoogleClient).toHaveBeenCalledWith();
    expect(mockRequest).toHaveBeenCalledWith({
      url: expect.any(String),
      method: 'POST',
      data: expect.objectContaining({
        contents: [{ parts: { text: 'test prompt' }, role: 'user' }],
      }),
      timeout: expect.any(Number),
    });
  });

  it('should return cached response if available', async () => {
    const mockCachedResponse = {
      cached: true,
      output: 'cached response text',
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
    };

    jest.mocked(getCache().get).mockResolvedValue(JSON.stringify(mockCachedResponse));

    const response = await provider.callGeminiApi('test prompt');

    expect(response).toEqual({
      ...mockCachedResponse,
      tokenUsage: {
        ...mockCachedResponse.tokenUsage,
        cached: mockCachedResponse.tokenUsage.total,
      },
    });
  });

  it('should handle API call errors', async () => {
    const mockError = new Error('something went wrong');
    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: jest.fn().mockRejectedValue(mockError),
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    const response = await provider.callGeminiApi('test prompt');

    expect(response).toEqual({
      error: `API call error: Error: something went wrong`,
    });
  });

  it('should handle API response errors', async () => {
    const mockResponse = {
      data: [
        {
          error: {
            code: 400,
            message: 'Bad Request',
          },
        },
      ],
    };

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: jest.fn().mockResolvedValue(mockResponse),
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    const response = await provider.callGeminiApi('test prompt');

    expect(response).toEqual({
      error: 'Error 400: Bad Request',
    });
  });
});

describe('maybeCoerceToGeminiFormat', () => {
  it('should return unmodified content if it matches GeminiFormat', () => {
    const input = [
      {
        role: 'user',
        parts: [{ text: 'Hello, Gemini!' }],
      },
    ];
    const result = vertexUtil.maybeCoerceToGeminiFormat(input);
    expect(result).toEqual({
      contents: input,
      coerced: false,
      systemInstruction: undefined,
    });
  });

  it('should coerce OpenAI chat format to GeminiFormat', () => {
    const input = [
      { role: 'user', content: 'Hello' },
      { role: 'user', content: ', ' },
      { role: 'user', content: 'Gemini!' },
    ];
    const expected = [
      {
        role: 'user',
        parts: [{ text: 'Hello' }],
      },
      {
        role: 'user',
        parts: [{ text: ', ' }],
      },
      {
        role: 'user',
        parts: [{ text: 'Gemini!' }],
      },
    ];
    const result = vertexUtil.maybeCoerceToGeminiFormat(input);
    expect(result).toEqual({
      contents: expected,
      coerced: true,
      systemInstruction: undefined,
    });
  });

  it('should coerce string input to GeminiFormat', () => {
    const input = 'Hello, Gemini!';
    const expected = [
      {
        parts: [{ text: 'Hello, Gemini!' }],
      },
    ];
    const result = vertexUtil.maybeCoerceToGeminiFormat(input);
    expect(result).toEqual({
      contents: expected,
      coerced: true,
      systemInstruction: undefined,
    });
  });

  it('should handle system messages and create systemInstruction', () => {
    const input = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];
    const result = vertexUtil.maybeCoerceToGeminiFormat(input);
    expect(result).toEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello!' }],
        },
      ],
      coerced: true,
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }],
      },
    });
  });

  it('should log a warning and return the input for unknown formats', () => {
    const loggerSpy = jest.spyOn(logger, 'warn');
    const input = { unknownFormat: 'test' };
    const result = vertexUtil.maybeCoerceToGeminiFormat(input);
    expect(result).toEqual({
      contents: input,
      coerced: false,
      systemInstruction: undefined,
    });
    expect(loggerSpy).toHaveBeenCalledWith(`Unknown format for Gemini: ${JSON.stringify(input)}`);
  });
});

describe('Vertex Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Provider Loading', () => {
    it('loadApiProvider with vertex:chat', async () => {
      const provider = await loadApiProvider('vertex:chat:vertex-chat-model');
      expect(provider).toBeInstanceOf(VertexChatProvider);
      expect(provider.id()).toBe('vertex:vertex-chat-model');
    });

    it('loadApiProvider with vertex:embedding', async () => {
      const provider = await loadApiProvider('vertex:embedding:vertex-embedding-model');
      expect(provider).toBeInstanceOf(VertexEmbeddingProvider);
      expect(provider.id()).toBe('vertex:vertex-embedding-model');
    });

    it('loadApiProvider with vertex:embeddings', async () => {
      const provider = await loadApiProvider('vertex:embeddings:vertex-embedding-model');
      expect(provider).toBeInstanceOf(VertexEmbeddingProvider);
      expect(provider.id()).toBe('vertex:vertex-embedding-model');
    });

    it('loadApiProvider with vertex:modelname', async () => {
      const provider = await loadApiProvider('vertex:vertex-chat-model');
      expect(provider).toBeInstanceOf(VertexChatProvider);
      expect(provider.id()).toBe('vertex:vertex-chat-model');
    });
  });

  describe('API Calls', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('VertexChatProvider callApi', async () => {
      const mockResponse = {
        data: [
          {
            candidates: [{ content: { parts: [{ text: 'Test output' }] } }],
            usageMetadata: {
              totalTokenCount: 10,
              promptTokenCount: 5,
              candidatesTokenCount: 5,
            },
          },
        ],
      };

      const mockRequest = jest.fn().mockResolvedValue(mockResponse);

      jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      const provider = new VertexChatProvider('vertex-chat-model');
      const result = await provider.callApi('Test prompt');

      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({
        total: 10,
        prompt: 5,
        completion: 5,
      });
    });

    it('VertexEmbeddingProvider callEmbeddingApi', async () => {
      const mockResponse = {
        data: {
          predictions: [
            {
              embeddings: {
                values: [0.1, 0.2, 0.3],
                statistics: {
                  token_count: 10,
                },
              },
            },
          ],
        },
      };

      const mockRequest = jest.fn().mockResolvedValue(mockResponse);

      jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      const provider = new VertexEmbeddingProvider('vertex-embedding-model');
      const result = await provider.callEmbeddingApi('Test text');

      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.tokenUsage).toEqual({
        total: 10,
      });
    });
  });
});
