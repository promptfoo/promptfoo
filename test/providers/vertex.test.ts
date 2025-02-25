import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth';
import { getCache, isCacheEnabled } from '../../src/cache';
import logger from '../../src/logger';
import { VertexChatProvider } from '../../src/providers/vertex';
import * as vertexUtil from '../../src/providers/vertexUtil';

jest.mock('../../src/cache', () => ({
  getCache: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
  }),
  isCacheEnabled: jest.fn(),
}));

jest.mock('../../src/providers/vertexUtil', () => ({
  ...jest.requireActual('../../src/providers/vertexUtil'),
  getGoogleClient: jest.fn(),
}));

describe('VertexChatProvider', () => {
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

  describe('callApi', () => {
    it('should call callClaudeApi for Claude models', async () => {
      const claudeProvider = new VertexChatProvider('claude-3');
      const mockResponse = { output: 'claude response' };
      jest.spyOn(claudeProvider, 'callClaudeApi').mockResolvedValue(mockResponse);

      const result = await claudeProvider.callApi('test prompt');

      expect(claudeProvider.callClaudeApi).toHaveBeenCalledWith('test prompt', undefined);
      expect(result).toEqual(mockResponse);
    });

    it('should call callGeminiApi for Gemini models', async () => {
      const mockResponse = { output: 'gemini response' };
      jest.spyOn(provider, 'callGeminiApi').mockResolvedValue(mockResponse);

      const result = await provider.callApi('test prompt');

      expect(provider.callGeminiApi).toHaveBeenCalledWith('test prompt', undefined);
      expect(result).toEqual(mockResponse);
    });

    it('should throw error for Llama models', async () => {
      const llamaProvider = new VertexChatProvider('llama-2');

      await expect(llamaProvider.callApi('test prompt')).rejects.toThrow(
        'Llama on Vertex is not supported yet',
      );
    });
  });

  describe('callClaudeApi', () => {
    let claudeProvider: VertexChatProvider;

    beforeEach(() => {
      claudeProvider = new VertexChatProvider('claude-3', {
        config: {
          anthropicVersion: 'vertex-2023-10-16',
          maxOutputTokens: 512,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
        },
      });
    });

    it('should call Claude API and return formatted response', async () => {
      const mockResponse = {
        data: {
          id: 'test-id',
          content: [{ type: 'text', text: 'response text' }],
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      };

      const mockRequest = jest.fn().mockResolvedValue(mockResponse);

      jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: { request: mockRequest } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      const response = await claudeProvider.callClaudeApi('test prompt');

      expect(response).toEqual({
        cached: false,
        output: 'response text',
        tokenUsage: {
          total: 30,
          prompt: 10,
          completion: 20,
        },
      });
    });

    it('should return cached response if available', async () => {
      const mockCachedResponse = {
        cached: true,
        output: 'cached response',
        tokenUsage: {
          total: 30,
          prompt: 10,
          completion: 20,
        },
      };

      jest.mocked(getCache().get).mockResolvedValue(JSON.stringify(mockCachedResponse));

      const response = await claudeProvider.callClaudeApi('test prompt');

      expect(response).toEqual({
        ...mockCachedResponse,
        tokenUsage: {
          ...mockCachedResponse.tokenUsage,
          cached: mockCachedResponse.tokenUsage.total,
        },
      });
    });

    it('should handle API errors', async () => {
      const mockError = {
        response: {
          data: { error: 'API error message' },
        },
      };

      jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: jest.fn().mockRejectedValue(mockError),
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      const response = await claudeProvider.callClaudeApi('test prompt');

      expect(response).toEqual({
        error: 'API call error: {"error":"API error message"}',
      });
    });

    it('should handle empty response content', async () => {
      const mockResponse = {
        data: {
          id: 'test-id',
          content: [],
          usage: {
            input_tokens: 10,
            output_tokens: 0,
          },
        },
      };

      jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: jest.fn().mockResolvedValue(mockResponse),
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      const response = await claudeProvider.callClaudeApi('test prompt');

      expect(response).toEqual({
        error: `No output found in Claude API response: ${JSON.stringify(mockResponse.data)}`,
      });
    });
  });

  describe('callGeminiApi', () => {
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
