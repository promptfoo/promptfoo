import * as fs from 'fs';
import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth';
import { getCache, isCacheEnabled } from '../../src/cache';
import logger from '../../src/logger';
import { VertexChatProvider } from '../../src/providers/vertex';
import * as vertexUtil from '../../src/providers/vertexUtil';

// Mock database
jest.mock('better-sqlite3', () => {
  return jest.fn().mockReturnValue({
    prepare: jest.fn(),
    transaction: jest.fn(),
    exec: jest.fn(),
    close: jest.fn(),
  });
});

jest.mock('../../src/database', () => ({
  getDb: jest.fn().mockReturnValue({
    prepare: jest.fn(),
    transaction: jest.fn(),
    exec: jest.fn(),
    close: jest.fn(),
  }),
}));

jest.mock('csv-stringify/sync', () => ({
  stringify: jest.fn().mockReturnValue('mocked,csv,output'),
}));

jest.mock('glob', () => ({
  globSync: jest.fn().mockReturnValue([]),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
}));

jest.mock('../../src/cache', () => ({
  getCache: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    wrap: jest.fn(),
    del: jest.fn(),
    reset: jest.fn(),
    store: {} as any,
  }),
  isCacheEnabled: jest.fn(),
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

  it('should handle function calling configuration', async () => {
    const tools = [
      {
        functionDeclarations: [
          {
            name: 'get_weather',
            description: 'Get weather information',
            parameters: {
              type: 'OBJECT' as const,
              properties: {
                location: {
                  type: 'STRING' as const,
                  description: 'City name',
                },
              },
              required: ['location'],
            },
          },
        ],
      },
    ];

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(tools));

    provider = new VertexChatProvider('gemini-pro', {
      config: {
        toolConfig: {
          functionCallingConfig: {
            mode: 'AUTO',
            allowedFunctionNames: ['get_weather'],
          },
        },
        tools,
      },
    });

    const mockResponse = {
      data: [
        {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'get_weather',
                      args: { location: 'San Francisco' },
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            totalTokenCount: 15,
            promptTokenCount: 8,
            candidatesTokenCount: 7,
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

    const response = await provider.callGeminiApi('What is the weather in San Francisco?');

    expect(response).toEqual({
      cached: false,
      output: JSON.stringify({
        functionCall: {
          name: 'get_weather',
          args: { location: 'San Francisco' },
        },
      }),
      tokenUsage: {
        total: 15,
        prompt: 8,
        completion: 7,
      },
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toolConfig: {
            functionCallingConfig: {
              mode: 'AUTO',
              allowedFunctionNames: ['get_weather'],
            },
          },
          tools,
        }),
      }),
    );
  });

  it('should load tools from external file and render variables', async () => {
    const mockExternalTools = [
      {
        functionDeclarations: [
          {
            name: 'get_weather',
            description: 'Get weather in San Francisco',
            parameters: {
              type: 'OBJECT' as const,
              properties: {
                location: { type: 'STRING' as const },
              },
            },
          },
        ],
      },
    ];

    // Mock file system operations
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockExternalTools));

    provider = new VertexChatProvider('gemini-pro', {
      config: {
        tools: 'file://tools.json' as any,
      },
    });

    const mockResponse = {
      data: [
        {
          candidates: [
            {
              content: {
                parts: [{ text: 'response with tools' }],
              },
            },
          ],
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

    const response = await provider.callGeminiApi('test prompt', {
      vars: { location: 'San Francisco' },
      prompt: { raw: 'test prompt', label: 'test' },
    });

    expect(response).toEqual({
      cached: false,
      output: 'response with tools',
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
    });

    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'));
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'), 'utf8');
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tools: mockExternalTools,
        }),
      }),
    );
  });

  it('should use model name in cache key', async () => {
    const mockResponse = {
      data: [
        {
          candidates: [
            {
              content: {
                parts: [{ text: 'response text' }],
              },
            },
          ],
          usageMetadata: {
            totalTokenCount: 10,
            promptTokenCount: 5,
            candidatesTokenCount: 5,
          },
        },
      ],
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);
    const mockCacheSet = jest.fn();

    jest.mocked(getCache).mockReturnValue({
      get: jest.fn(),
      set: mockCacheSet,
      wrap: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
      store: {} as any,
    });

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    provider = new VertexChatProvider('gemini-2.0-flash-001');
    await provider.callGeminiApi('test prompt');

    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('vertex:gemini-2.0-flash-001:'),
      expect.any(String),
    );
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
