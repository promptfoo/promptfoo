import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { GeminiImageProvider } from '../../../src/providers/google/gemini-image';
import * as googleUtil from '../../../src/providers/google/util';

vi.mock('../../../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

vi.mock('../../../src/providers/google/util', () => ({
  getGoogleClient: vi.fn(),
  loadCredentials: vi.fn(),
  resolveProjectId: vi.fn(),
  geminiFormatAndSystemInstructions: vi.fn().mockImplementation((prompt) => ({
    contents: [{ parts: [{ text: prompt }], role: 'user' }],
    systemInstruction: undefined,
  })),
  createAuthCacheDiscriminator: vi.fn().mockReturnValue(''),
}));

describe('GeminiImageProvider', () => {
  const mockFetchWithCache = vi.mocked(fetchWithCache);
  const mockGetGoogleClient = vi.mocked(googleUtil.getGoogleClient);
  const mockLoadCredentials = vi.mocked(googleUtil.loadCredentials);
  const mockResolveProjectId = vi.mocked(googleUtil.resolveProjectId);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_API_KEY = 'test-api-key';
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_PROJECT_ID;

    mockLoadCredentials.mockImplementation((creds) => {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    mockResolveProjectId.mockResolvedValue('test-project');
  });

  afterEach(() => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_PROJECT_ID;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('should construct with model name', () => {
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview');
    expect(provider.id()).toBe('google:gemini-3-pro-image-preview');
    expect(provider.toString()).toBe(
      '[Google Gemini Image Generation Provider gemini-3-pro-image-preview]',
    );
  });

  it('should use Google AI Studio when API key is available', async () => {
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

    mockFetchWithCache.mockResolvedValueOnce({
      status: 200,
      data: {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Here is your image:' },
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'base64imagedata',
                  },
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 1290,
          totalTokenCount: 1300,
        },
      },
      cached: false,
      statusText: 'OK',
    });

    const result = await provider.callApi('Generate a picture of a cat');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining(
        'generativelanguage.googleapis.com/v1alpha/models/gemini-3-pro-image-preview:generateContent',
      ),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"responseModalities":["TEXT","IMAGE"]'),
      }),
      expect.any(Number),
      'json',
      false,
    );

    expect(result.output).toContain('Here is your image:');
    expect(result.output).toContain('![Generated Image](data:image/png;base64,base64imagedata)');
  });

  it('should return error when both project ID and API key are missing', async () => {
    delete process.env.GOOGLE_PROJECT_ID;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Gemini image models require either:');
    expect(result.error).toContain('Google AI Studio');
    expect(result.error).toContain('Vertex AI');
  });

  it('should return error for empty prompt', async () => {
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview');
    const result = await provider.callApi('');

    expect(result.error).toBe('Prompt is required for image generation');
  });

  describe('Vertex AI', () => {
    beforeEach(() => {
      process.env.GOOGLE_PROJECT_ID = 'test-project';
    });

    it('should use OAuth authentication for Vertex AI', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
        config: {
          projectId: 'test-project',
        },
      });

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          data: {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: 'image/png',
                        data: 'base64data',
                      },
                    },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
          },
        }),
      };

      mockGetGoogleClient.mockResolvedValue({
        client: mockClient as any,
        projectId: 'test-project',
      });

      const result = await provider.callApi('Test prompt');

      expect(mockGetGoogleClient).toHaveBeenCalled();

      expect(mockClient.request).toHaveBeenCalledWith({
        url: expect.stringContaining('aiplatform.googleapis.com'),
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        data: expect.objectContaining({
          generationConfig: expect.objectContaining({
            responseModalities: ['TEXT', 'IMAGE'],
          }),
        }),
        timeout: 300000,
      });

      expect(result.output).toContain('![Generated Image](data:image/png;base64,base64data)');
    });

    it('should handle OAuth errors', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
        config: {
          projectId: 'test-project',
        },
      });

      mockGetGoogleClient.mockRejectedValue(new Error('Google auth library not found'));

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Failed to call Vertex AI');
      expect(result.error).toContain('Google auth library not found');
    });
  });

  describe('Image configuration', () => {
    it('should pass imageAspectRatio and imageSize config for Gemini 3 models', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
        config: {
          imageAspectRatio: '16:9',
          imageSize: '2K',
        },
      });

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: 'base64data',
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"imageConfig"'),
        }),
        expect.any(Number),
        'json',
        false,
      );

      const callArgs = mockFetchWithCache.mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.generationConfig.imageConfig).toEqual({
        aspectRatio: '16:9',
        imageSize: '2K',
      });
    });

    it('should NOT include imageSize for non-Gemini 3 models', async () => {
      const provider = new GeminiImageProvider('gemini-2.5-flash-image', {
        config: {
          imageAspectRatio: '16:9',
          imageSize: '1K', // This should be ignored for Gemini 2.5 models
        },
      });

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: 'base64data',
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      await provider.callApi('Test prompt');

      const callArgs = mockFetchWithCache.mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      // Should only have aspectRatio, not imageSize
      expect(body.generationConfig.imageConfig).toEqual({
        aspectRatio: '16:9',
      });
      expect(body.generationConfig.imageConfig.imageSize).toBeUndefined();
    });
  });

  describe('Response handling', () => {
    it('should handle blocked response', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: { parts: [] },
              finishReason: 'SAFETY',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Response was blocked with finish reason: SAFETY');
    });

    it('should handle prompt blocked response', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [],
          promptFeedback: {
            blockReason: 'PROHIBITED_CONTENT',
          },
        },
        cached: false,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Response blocked: PROHIBITED_CONTENT');
    });

    it('should handle API error response', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 400,
        statusText: 'Bad Request',
        cached: false,
        data: {
          error: {
            message: 'Invalid request',
          },
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe('Invalid request');
    });

    it('should return token usage', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: 'base64data',
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 1290,
            totalTokenCount: 1300,
          },
        },
        cached: false,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(result.tokenUsage).toEqual({
        prompt: 10,
        completion: 1290,
        total: 1300,
        numRequests: 1,
      });
    });
  });

  describe('Cost calculation', () => {
    it('should return correct cost for gemini-3-pro-image-preview', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: 'base64data',
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(result.cost).toBe(0.05);
    });

    it('should return correct cost for gemini-2.5-flash-image', async () => {
      const provider = new GeminiImageProvider('gemini-2.5-flash-image');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: 'base64data',
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(result.cost).toBe(0.039);
    });
  });

  describe('API key handling', () => {
    it('should support GEMINI_API_KEY environment variable', async () => {
      delete process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'gemini-key';

      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: 'base64data',
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.not.stringContaining('key='), // API key should NOT be in URL
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-goog-api-key': 'gemini-key',
          }),
        }),
        expect.any(Number),
        'json',
        false,
      );
      expect(result.output).toContain('![Generated Image]');
    });

    it('should use apiKey from config', async () => {
      delete process.env.GOOGLE_API_KEY;

      const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
        config: {
          apiKey: 'config-api-key',
        },
      });

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: 'base64data',
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.not.stringContaining('key='), // API key should NOT be in URL
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-goog-api-key': 'config-api-key',
          }),
        }),
        expect.any(Number),
        'json',
        false,
      );
    });
  });

  describe('API version selection', () => {
    it('should use v1alpha for gemini-3 models', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'image/png', data: 'base64data' } }],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/v1alpha/'),
        expect.any(Object),
        expect.any(Number),
        'json',
        false,
      );
    });

    it('should use v1beta for non-gemini-3 models', async () => {
      const provider = new GeminiImageProvider('gemini-2.5-flash-image');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'image/png', data: 'base64data' } }],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/v1beta/'),
        expect.any(Object),
        expect.any(Number),
        'json',
        false,
      );
    });
  });
});
