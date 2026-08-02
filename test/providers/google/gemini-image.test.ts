import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { GeminiImageProvider } from '../../../src/providers/google/gemini-image';
import * as googleUtil from '../../../src/providers/google/util';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

vi.mock('../../../src/providers/google/util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/providers/google/util')>();
  return {
    ...actual,
    getGoogleClient: vi.fn(),
    loadCredentials: vi.fn(),
    resolveProjectId: vi.fn(),
    geminiFormatAndSystemInstructions: vi.fn().mockImplementation((prompt) => ({
      contents: [{ parts: [{ text: prompt }], role: 'user' }],
      systemInstruction: undefined,
    })),
    createAuthCacheDiscriminator: vi.fn().mockReturnValue(''),
    normalizeTools: actual.normalizeTools,
  };
});

describe('GeminiImageProvider', () => {
  const mockFetchWithCache = vi.mocked(fetchWithCache);
  const mockGetGoogleClient = vi.mocked(googleUtil.getGoogleClient);
  const mockLoadCredentials = vi.mocked(googleUtil.loadCredentials);
  const mockResolveProjectId = vi.mocked(googleUtil.resolveProjectId);
  const mockSuccessfulImageResponse = () =>
    mockFetchWithCache.mockResolvedValueOnce({
      status: 200,
      data: {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: 'base64imagedata' } }],
            },
            finishReason: 'STOP',
          },
        ],
      },
      cached: false,
      statusText: 'OK',
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessEnv({ GOOGLE_API_KEY: 'test-api-key' });
    mockProcessEnv({ GOOGLE_GENERATIVE_AI_API_KEY: undefined });
    mockProcessEnv({ GEMINI_API_KEY: undefined });
    mockProcessEnv({ GOOGLE_PROJECT_ID: undefined });
    mockProcessEnv({ GOOGLE_CLOUD_PROJECT: undefined });
    mockProcessEnv({ VERTEX_PROJECT_ID: undefined });
    mockProcessEnv({ VERTEX_REGION: undefined });
    mockProcessEnv({ GOOGLE_CLOUD_LOCATION: undefined });
    mockProcessEnv({ GOOGLE_LOCATION: undefined });

    mockLoadCredentials.mockImplementation((creds) => {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    mockResolveProjectId.mockResolvedValue('test-project');
  });

  afterEach(() => {
    mockProcessEnv({ GOOGLE_API_KEY: undefined });
    mockProcessEnv({ GOOGLE_PROJECT_ID: undefined });
    mockProcessEnv({ GOOGLE_CLOUD_PROJECT: undefined });
    mockProcessEnv({ VERTEX_PROJECT_ID: undefined });
    mockProcessEnv({ VERTEX_REGION: undefined });
    mockProcessEnv({ GOOGLE_CLOUD_LOCATION: undefined });
    mockProcessEnv({ GOOGLE_LOCATION: undefined });
    mockProcessEnv({ GOOGLE_GENERATIVE_AI_API_KEY: undefined });
    mockProcessEnv({ GEMINI_API_KEY: undefined });
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
        'generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
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

    // Text + image: text as output, images in structured field
    expect(result.output).toBe('Here is your image:');
    expect(result.images).toEqual([
      { data: 'data:image/png;base64,base64imagedata', mimeType: 'image/png' },
    ]);
  });

  it('should prefer a provider-scoped Google API key over process scope', async () => {
    mockProcessEnv({ GOOGLE_API_KEY: 'process-api-key' });
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
      env: { GOOGLE_API_KEY: 'provider-api-key' },
    });
    mockFetchWithCache.mockResolvedValueOnce({
      status: 200,
      data: {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: 'base64imagedata' } }],
            },
            finishReason: 'STOP',
          },
        ],
      },
      cached: false,
      statusText: 'OK',
    });

    const result = await provider.callApi('Test prompt');

    expect(result.error).toBeUndefined();
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'provider-api-key' }),
      }),
      expect.any(Number),
      'json',
      false,
    );
  });

  it('should honor vertexai: false with an AI Studio key over provider and process Vertex projects', async () => {
    mockProcessEnv({ GOOGLE_PROJECT_ID: 'process-project' });
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
      config: { vertexai: false, apiKey: 'studio-api-key' },
      env: { VERTEX_PROJECT_ID: 'provider-project' },
    });
    mockFetchWithCache.mockResolvedValueOnce({
      status: 200,
      data: {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: 'base64imagedata' } }],
            },
            finishReason: 'STOP',
          },
        ],
      },
      cached: false,
      statusText: 'OK',
    });

    const result = await provider.callApi('Test prompt');

    expect(result.error).toBeUndefined();
    expect(mockGetGoogleClient).not.toHaveBeenCalled();
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining(
        'generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
      ),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'studio-api-key' }),
      }),
      expect.any(Number),
      'json',
      false,
    );
  });

  it('should use Vertex Express when vertexai is true with an API key and no project', async () => {
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
      config: { vertexai: true, apiKey: 'vertex-express-key' },
    });
    mockSuccessfulImageResponse();

    const result = await provider.callApi('Test prompt');

    expect(result.error).toBeUndefined();
    expect(mockGetGoogleClient).not.toHaveBeenCalled();
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3-pro-image-preview:generateContent',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'vertex-express-key' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('should honor a custom base URL for Vertex Express image requests', async () => {
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
      config: {
        vertexai: true,
        apiKey: 'vertex-express-key',
        apiBaseUrl: 'https://gateway.example.com/vertex/',
      },
    });
    mockSuccessfulImageResponse();

    await provider.callApi('Test prompt');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://gateway.example.com/vertex/v1/publishers/google/models/gemini-3-pro-image-preview:generateContent',
      expect.any(Object),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('should reject a non-global region for Vertex Express image requests', async () => {
    const provider = new GeminiImageProvider('gemini-2.5-flash-image', {
      config: { vertexai: true, apiKey: 'vertex-express-key', region: 'europe-west1' },
    });

    const result = await provider.callApi('Test prompt');

    expect(mockFetchWithCache).not.toHaveBeenCalled();
    expect(result.error).toContain('Vertex Express image generation supports only the global');
  });

  it('should honor explicit Express mode over an ambient project', async () => {
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
      config: { vertexai: true, expressMode: true, apiKey: 'vertex-express-key' },
      env: { GOOGLE_CLOUD_PROJECT: 'ambient-project' },
    });
    mockSuccessfulImageResponse();

    const result = await provider.callApi('Test prompt');

    expect(result.error).toBeUndefined();
    expect(mockGetGoogleClient).not.toHaveBeenCalled();
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('aiplatform.googleapis.com/v1/publishers/google/models/'),
      expect.any(Object),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('should resolve a provider-scoped VERTEX_API_KEY for Vertex Express', async () => {
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
      config: { vertexai: true },
      env: { VERTEX_API_KEY: 'provider-vertex-key' },
    });
    mockSuccessfulImageResponse();

    const result = await provider.callApi('Test prompt');

    expect(result.error).toBeUndefined();
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('aiplatform.googleapis.com/v1/publishers/google/models/'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'provider-vertex-key' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('should not use an AI Studio-only GEMINI_API_KEY for Vertex Express', async () => {
    mockProcessEnv({ GOOGLE_API_KEY: undefined });
    mockResolveProjectId.mockResolvedValue(undefined as any);
    mockGetGoogleClient.mockResolvedValue({ client: { request: vi.fn() } } as any);
    const provider = new GeminiImageProvider('gemini-3-pro-image-preview', {
      config: { vertexai: true },
      env: { GEMINI_API_KEY: 'studio-only-key' },
    });

    const result = await provider.callApi('Test prompt');

    expect(mockFetchWithCache).not.toHaveBeenCalled();
    expect(result.error).toContain('Google project ID is required for Vertex AI');
  });

  it('should return error when both project ID and API key are missing', async () => {
    mockProcessEnv({ GOOGLE_PROJECT_ID: undefined });
    mockProcessEnv({ GOOGLE_API_KEY: undefined });
    mockProcessEnv({ GOOGLE_GENERATIVE_AI_API_KEY: undefined });
    mockProcessEnv({ GEMINI_API_KEY: undefined });
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
      mockProcessEnv({ GOOGLE_PROJECT_ID: 'test-project' });
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

      expect(result.output).toBe('data:image/png;base64,base64data');
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

    it('should select Vertex with a provider-scoped VERTEX_PROJECT_ID over process scope and an API key', async () => {
      mockProcessEnv({ GOOGLE_PROJECT_ID: undefined });
      mockProcessEnv({ VERTEX_PROJECT_ID: 'process-project' });
      mockResolveProjectId.mockImplementation(async (config, env) => {
        return (
          config.projectId ||
          env?.VERTEX_PROJECT_ID ||
          process.env.VERTEX_PROJECT_ID ||
          'adc-project'
        );
      });
      const provider = new GeminiImageProvider('gemini-2.5-flash-image', {
        env: { VERTEX_PROJECT_ID: 'provider-project' },
      });
      const mockClient = {
        request: vi.fn().mockResolvedValue({
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
        }),
      };
      mockGetGoogleClient.mockResolvedValue({
        client: mockClient as any,
        projectId: 'adc-project',
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeUndefined();
      expect(mockFetchWithCache).not.toHaveBeenCalled();
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/projects/provider-project/'),
        }),
      );
    });

    it.each([
      {
        description: 'GOOGLE_CLOUD_LOCATION',
        env: { GOOGLE_CLOUD_LOCATION: 'europe-west1' },
        expectedLocation: 'europe-west1',
        expectedHost: 'europe-west1-aiplatform.googleapis.com',
      },
      {
        description: 'VERTEX_REGION',
        env: { VERTEX_REGION: 'asia-south1' },
        expectedLocation: 'asia-south1',
        expectedHost: 'asia-south1-aiplatform.googleapis.com',
      },
      {
        description: 'global location',
        env: { GOOGLE_CLOUD_LOCATION: 'global' },
        expectedLocation: 'global',
        expectedHost: 'aiplatform.googleapis.com',
      },
    ])('should use provider-scoped $description over process VERTEX_REGION for regional image models', async ({
      env,
      expectedLocation,
      expectedHost,
    }) => {
      mockProcessEnv({ VERTEX_REGION: 'process-location' });
      const provider = new GeminiImageProvider('gemini-2.5-flash-image', {
        config: { projectId: 'test-project' },
        env,
      });
      const mockClient = {
        request: vi.fn().mockResolvedValue({
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
        }),
      };
      mockGetGoogleClient.mockResolvedValue({
        client: mockClient as any,
        projectId: 'test-project',
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeUndefined();
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `https://${expectedHost}/v1/projects/test-project/locations/${expectedLocation}/publishers/google/models/gemini-2.5-flash-image:generateContent`,
        }),
      );
    });

    it('should use global endpoint with v1 for gemini-3-pro-image-preview', async () => {
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
                  parts: [{ inlineData: { mimeType: 'image/png', data: 'base64data' } }],
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

      await provider.callApi('Test prompt');

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('https://aiplatform.googleapis.com/v1/'),
        }),
      );
      // Global endpoint uses location=global
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/locations/global/'),
        }),
      );
    });

    it('should use global endpoint with v1 for gemini-3.1-flash-image-preview', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image-preview', {
        config: {
          projectId: 'test-project',
          region: 'us-central1',
        },
      });

      const mockClient = {
        request: vi.fn().mockResolvedValue({
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
        }),
      };

      mockGetGoogleClient.mockResolvedValue({
        client: mockClient as any,
        projectId: 'test-project',
      });

      await provider.callApi('Test prompt');

      // Gemini 3.1 should use global endpoint, same as Gemini 3.0
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('https://aiplatform.googleapis.com/v1/'),
        }),
      );
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/locations/global/'),
        }),
      );
    });

    it('should use global endpoint with v1 for gemini-3.1-flash-lite-image', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-lite-image', {
        config: {
          projectId: 'test-project',
          region: 'us-central1',
        },
      });

      const mockClient = {
        request: vi.fn().mockResolvedValue({
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
        }),
      };

      mockGetGoogleClient.mockResolvedValue({
        client: mockClient as any,
        projectId: 'test-project',
      });

      await provider.callApi('Test prompt');

      // Nano Banana 2 Lite is a Gemini 3.x model and uses the global endpoint
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('https://aiplatform.googleapis.com/v1/'),
        }),
      );
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(
            '/publishers/google/models/gemini-3.1-flash-lite-image:generateContent',
          ),
        }),
      );
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

    it('should merge top-level options with a pass-through generationConfig.imageConfig', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image', {
        config: {
          imageAspectRatio: '16:9',
          generationConfig: { imageConfig: { imageSize: '2K' } },
        },
      });

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

      const result = await provider.callApi('Test prompt');

      const callArgs = mockFetchWithCache.mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      // The nested imageSize must survive the top-level aspectRatio override
      // and be billed at its tier.
      expect(body.generationConfig.imageConfig).toEqual({
        aspectRatio: '16:9',
        imageSize: '2K',
      });
      expect(result.cost).toBe(0.101);
    });

    it('should pass imageSize config for gemini-3.1-flash-image-preview', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image-preview', {
        config: {
          imageAspectRatio: '1:1',
          imageSize: '512px',
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
      expect(body.generationConfig.imageConfig).toEqual({
        aspectRatio: '1:1',
        imageSize: '512px',
      });
    });

    it('should pass imageSize config for gemini-3.1-flash-lite-image', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-lite-image', {
        config: {
          imageAspectRatio: '16:9',
          imageSize: '1K',
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
      expect(body.generationConfig.imageConfig).toEqual({
        aspectRatio: '16:9',
        imageSize: '1K',
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

    it('should count cached responses as one logical request', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: 'cached response' }],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 4,
            candidatesTokenCount: 6,
            totalTokenCount: 10,
          },
        },
        cached: true,
        statusText: 'OK',
      });

      const result = await provider.callApi('Generate a picture of a cat');

      expect(result.tokenUsage).toEqual({
        cached: 10,
        total: 10,
        numRequests: 1,
      });
    });
  });

  describe('Multi-image responses', () => {
    it('should return all images in structured field for image-only response', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { mimeType: 'image/png', data: 'img1data' } },
                  { inlineData: { mimeType: 'image/jpeg', data: 'img2data' } },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      const result = await provider.callApi('Generate two images');

      // First image used as output for blob externalization
      expect(result.output).toBe('data:image/png;base64,img1data');
      // All images in structured field
      expect(result.images).toEqual([
        { data: 'data:image/png;base64,img1data', mimeType: 'image/png' },
        { data: 'data:image/jpeg;base64,img2data', mimeType: 'image/jpeg' },
      ]);
    });

    it('should return text + multiple images with structured field', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Here are your images:' },
                  { inlineData: { mimeType: 'image/png', data: 'img1data' } },
                  { inlineData: { mimeType: 'image/png', data: 'img2data' } },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      const result = await provider.callApi('Generate two images with description');

      // Text as output
      expect(result.output).toBe('Here are your images:');
      // All images in structured field
      expect(result.images).toEqual([
        { data: 'data:image/png;base64,img1data', mimeType: 'image/png' },
        { data: 'data:image/png;base64,img2data', mimeType: 'image/png' },
      ]);
    });

    it('should not set images field for text-only response', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image-preview');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Just text, no images.' }],
              },
              finishReason: 'STOP',
            },
          ],
        },
        cached: false,
        statusText: 'OK',
      });

      const result = await provider.callApi('Tell me something');

      expect(result.output).toBe('Just text, no images.');
      expect(result.images).toBeUndefined();
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

      expect(result.cost).toBe(0.134);
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

    it('should return correct cost for gemini-3.1-flash-image-preview', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image-preview');

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

      expect(result.cost).toBe(0.067);
    });

    it('should return correct cost for gemini-3.1-flash-lite-image (Nano Banana 2 Lite)', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-lite-image');

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

      expect(result.cost).toBe(0.0336);
    });

    it('should return correct cost for gemini-3.1-flash-image (GA Nano Banana 2)', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image');

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

      const result = await provider.callApi('Test prompt');

      expect(result.cost).toBe(0.067);
    });

    it('should return correct cost for gemini-3-pro-image (GA Nano Banana Pro)', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image');

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

      const result = await provider.callApi('Test prompt');

      expect(result.cost).toBe(0.134);
    });

    it.each([
      { model: 'gemini-3.1-flash-image', imageSize: '512px', expected: 0.045 },
      { model: 'gemini-3.1-flash-image', imageSize: '1K', expected: 0.067 },
      { model: 'gemini-3.1-flash-image', imageSize: '2K', expected: 0.101 },
      { model: 'gemini-3.1-flash-image', imageSize: '4K', expected: 0.151 },
      { model: 'gemini-3-pro-image', imageSize: '2K', expected: 0.134 },
      { model: 'gemini-3-pro-image', imageSize: '4K', expected: 0.24 },
    ] as const)('should scale per-image cost by imageSize ($model @ $imageSize)', async ({
      model,
      imageSize,
      expected,
    }) => {
      const provider = new GeminiImageProvider(model, { config: { imageSize } });

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

      const result = await provider.callApi('Test prompt');

      expect(result.cost).toBe(expected);
    });

    it('should default resolution-tiered cost to the 1K price when imageSize is unset', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image');

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

      const result = await provider.callApi('Test prompt');

      expect(result.cost).toBe(0.067);
    });

    it('should not report cost for cached responses', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image');

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
          usageMetadata: { totalTokenCount: 1200 },
        },
        cached: true,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(result.cached).toBe(true);
      expect(result.cost).toBeUndefined();
    });

    it('should bill prompt and text/thinking tokens on top of the per-image price', async () => {
      const provider = new GeminiImageProvider('gemini-3-pro-image');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Here is your image.' },
                  { inlineData: { mimeType: 'image/png', data: 'base64data' } },
                ],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 1000,
            candidatesTokenCount: 1130,
            totalTokenCount: 2630,
            thoughtsTokenCount: 500,
            candidatesTokensDetails: [
              { modality: 'IMAGE', tokenCount: 1120 },
              { modality: 'TEXT', tokenCount: 10 },
            ],
          },
        },
        cached: false,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      // $0.134 per image + 1000 input tokens * $2/1M + (10 text + 500 thinking) * $12/1M
      expect(result.cost).toBeCloseTo(0.134 + 0.002 + 0.00612, 10);
    });

    it('should price by generationConfig.imageConfig.imageSize when the top-level option is unset', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image', {
        config: { generationConfig: { imageConfig: { imageSize: '4K' } } },
      });

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

      const result = await provider.callApi('Test prompt');

      expect(result.cost).toBe(0.151);
    });

    it('should not bill thought images as final images', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, inlineData: { mimeType: 'image/png', data: 'draftimage' } },
                  { inlineData: { mimeType: 'image/png', data: 'finalimage' } },
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

      expect(result.images).toHaveLength(1);
      expect(result.images![0].data).toBe('data:image/png;base64,finalimage');
      expect(result.cost).toBe(0.067);
    });
  });

  describe('Image size validation', () => {
    it('should reject unsupported image sizes for gemini-3.1-flash-lite-image', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-lite-image', {
        config: { imageSize: '4K' },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('only supports imageSize 1K');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });

    it('should reject unsupported nested imageConfig sizes for gemini-3.1-flash-lite-image', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-lite-image', {
        config: { generationConfig: { imageConfig: { imageSize: '2K' } } },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('only supports imageSize 1K');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });

    it('should accept 1K for gemini-3.1-flash-lite-image', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-lite-image', {
        config: { imageSize: '1K' },
      });

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

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeUndefined();
      expect(result.cost).toBe(0.0336);
    });
  });

  describe('API key handling', () => {
    it('should support GEMINI_API_KEY environment variable', async () => {
      mockProcessEnv({ GOOGLE_API_KEY: undefined });
      mockProcessEnv({ GEMINI_API_KEY: 'gemini-key' });

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
      expect(result.output).toContain('data:image/png;base64,');
    });

    it('should use apiKey from config', async () => {
      mockProcessEnv({ GOOGLE_API_KEY: undefined });

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
    it('should use v1beta for gemini-3 models', async () => {
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
        expect.stringContaining('/v1beta/'),
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

    it('should use v1beta for gemini-3.1 image models', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image-preview');

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

  describe('Grounding tools', () => {
    it('should include googleSearch tool in request body', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image-preview', {
        config: {
          tools: [
            {
              googleSearch: {},
            },
          ],
        },
      });

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

      await provider.callApi('Generate a grounded image');

      const callArgs = mockFetchWithCache.mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.tools).toEqual([{ googleSearch: {} }]);
    });

    it('should preserve googleSearch when function calling is disabled', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image-preview', {
        config: {
          tools: [
            {
              googleSearch: {},
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: 'NONE',
            },
          },
        },
      });

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

      await provider.callApi('Generate a grounded image');

      const callArgs = mockFetchWithCache.mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: 'NONE' } });
      expect(body.tools).toEqual([{ googleSearch: {} }]);
    });

    it('should normalize google_search tool format to googleSearch', async () => {
      const provider = new GeminiImageProvider('gemini-3.1-flash-image-preview', {
        config: {
          tools: [
            {
              google_search: {
                searchTypes: {
                  webSearch: {},
                  imageSearch: {},
                },
              },
            } as any,
          ],
        },
      });

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

      await provider.callApi('Generate a grounded image');

      const callArgs = mockFetchWithCache.mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.tools).toMatchObject([
        {
          googleSearch: {
            searchTypes: {
              webSearch: {},
              imageSearch: {},
            },
          },
        },
      ]);
    });
  });
});
