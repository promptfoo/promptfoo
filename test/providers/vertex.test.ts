import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth';
import { getCache, isCacheEnabled, fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import logger from '../../src/logger';
import { VertexChatProvider } from '../../src/providers/vertex';
import * as vertexUtil from '../../src/providers/vertexUtil';

jest.mock('../../src/cache', () => ({
  getCache: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
  }),
  isCacheEnabled: jest.fn(),
  fetchWithCache: jest.fn(),
}));

jest.mock('../../src/providers/vertexUtil', () => ({
  ...jest.requireActual('../../src/providers/vertexUtil'),
  getGoogleClient: jest.fn(),
}));

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

  it('should handle OpenAI chat format with content as an array of objects', () => {
    const input = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is {{thing}}?',
          },
        ],
      },
    ];

    const result = vertexUtil.maybeCoerceToGeminiFormat(input);

    expect(result).toEqual({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'What is {{thing}}?',
            },
          ],
        },
      ],
      coerced: true,
      systemInstruction: {
        parts: [{ text: 'You are a helpful AI assistant.' }],
      },
    });
  });

  it('should handle string content', () => {
    // This simulates the parsed YAML format
    const input = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant.',
      },
      {
        role: 'user',
        content: 'What is {{thing}}?',
      },
    ];

    const result = vertexUtil.maybeCoerceToGeminiFormat(input);

    expect(result).toEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'What is {{thing}}?' }],
        },
      ],
      coerced: true,
      systemInstruction: {
        parts: [{ text: 'You are a helpful AI assistant.' }],
      },
    });
  });

  it('should handle mixed content types', () => {
    const input = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'First part' },
          'Second part as string',
          { type: 'image', url: 'https://example.com/image.jpg' },
        ],
      },
    ];

    const result = vertexUtil.maybeCoerceToGeminiFormat(input);

    expect(result).toEqual({
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'First part' },
            { text: 'Second part as string' },
            { type: 'image', url: 'https://example.com/image.jpg' },
          ],
        },
      ],
      coerced: true,
      systemInstruction: undefined,
    });
  });
});

describe('Vertex Provider', () => {
  let originalState: Partial<typeof cliState>;

  beforeAll(() => {
    originalState = { ...cliState };
  });

  afterAll(() => {
    // Restore cliState
    Object.keys(cliState).forEach((key) => {
      delete (cliState as any)[key];
    });
    Object.assign(cliState, originalState);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    // Reset cliState between tests
    Object.keys(cliState).forEach((key) => {
      delete (cliState as any)[key];
    });
  });

  describe('Safety filtering handling', () => {
    it('should return output instead of error for safety blocks in redteam mode', async () => {
      // Set redteam mode
      cliState.isRedteam = true;

      // Create a provider
      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          projectId: 'test-project',
        },
      });

      // The provider doesn't use the callApi directly for Gemini models
      // It redirects to callGeminiApi, so we'll spy on that
      const callGeminiApiSpy = jest.spyOn(provider, 'callGeminiApi');
      callGeminiApiSpy.mockResolvedValue({
        output: 'Content was blocked due to safety settings.',
      });

      // Call the API
      const result = await provider.callApi('Prompt that triggers safety filter');

      // Verify we get an output, not an error
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Content was blocked due to safety settings.');
    });

    it('should return error for safety blocks in non-redteam mode', async () => {
      // Make sure redteam mode is off
      cliState.isRedteam = false;

      // Create a provider
      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          projectId: 'test-project',
        },
      });

      // The provider doesn't use the callApi directly for Gemini models
      // It redirects to callGeminiApi, so we'll spy on that
      const callGeminiApiSpy = jest.spyOn(provider, 'callGeminiApi');
      callGeminiApiSpy.mockResolvedValue({
        error: 'Content was blocked due to safety settings.',
      });

      // Call the API
      const result = await provider.callApi('Prompt that triggers safety filter');

      // Verify we get an error
      expect(result.error).toBe('Content was blocked due to safety settings.');
      expect(result.output).toBeUndefined();
    });

    it('should handle promptFeedback blocks in redteam mode', async () => {
      // Set redteam mode
      cliState.isRedteam = true;

      // Create a provider
      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          projectId: 'test-project',
        },
      });

      // Mock getGoogleClient
      const mockRequest = jest.fn().mockResolvedValue({
        data: [
          {
            promptFeedback: {
              blockReason: 'SAFETY',
            },
          },
        ],
      });

      jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      // Call the API
      const result = await provider.callApi('Prompt that triggers safety filter');

      // Verify we get an output, not an error
      expect(result.error).toBeUndefined();
      expect(result.output).toBeDefined();
    });
  });
});
