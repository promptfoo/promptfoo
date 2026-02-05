import * as fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import { GoogleProvider } from '../../../src/providers/google/provider';
import * as util from '../../../src/providers/google/util';
import * as fetchUtil from '../../../src/util/fetch/index';
import { getNunjucksEngineForFilePath } from '../../../src/util/file';
import * as templates from '../../../src/util/templates';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

vi.mock('../../../src/util/fetch/index', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithProxy: vi.fn(),
  };
});

vi.mock('../../../src/providers/google/util', async () => ({
  ...(await vi.importActual('../../../src/providers/google/util')),
  maybeCoerceToGeminiFormat: vi.fn(),
  getGoogleClient: vi.fn().mockResolvedValue({
    client: {
      request: vi.fn().mockResolvedValue({
        data: {
          candidates: [{ content: { parts: [{ text: 'test response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
        },
      }),
    },
    credentials: {},
  }),
  loadCredentials: vi.fn().mockReturnValue({}),
  createAuthCacheDiscriminator: vi.fn().mockReturnValue(''),
}));

vi.mock('../../../src/util/templates', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getNunjucksEngine: vi.fn(() => ({
      renderString: vi.fn((str) => str),
    })),
  };
});

// Hoisted mocks for file loading functions
const mockMaybeLoadToolsFromExternalFile = vi.hoisted(() => vi.fn((input) => input));
const mockMaybeLoadFromExternalFile = vi.hoisted(() => vi.fn((input) => input));

vi.mock('../../../src/util/file', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getNunjucksEngineForFilePath: vi.fn(),
    maybeLoadToolsFromExternalFile: mockMaybeLoadToolsFromExternalFile,
    maybeLoadFromExternalFile: mockMaybeLoadFromExternalFile,
  };
});

// Also mock the barrel file since the provider imports from util/index
vi.mock('../../../src/util/index', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadToolsFromExternalFile: mockMaybeLoadToolsFromExternalFile,
  };
});

vi.mock('glob', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    globSync: vi.fn().mockReturnValue([]),
  };
});

// Mock envars to control API key availability in tests
vi.mock('../../../src/envars', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getEnvString: vi.fn().mockReturnValue(undefined),
  };
});

vi.mock('fs', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
  };
});

describe('GoogleProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset hoisted mocks to default pass-through behavior
    mockMaybeLoadToolsFromExternalFile.mockReset().mockImplementation((input) => input);
    mockMaybeLoadFromExternalFile.mockReset().mockImplementation((input) => input);
    vi.mocked(templates.getNunjucksEngine).mockImplementation(function () {
      return {
        renderString: vi.fn((str) => str),
      } as any;
    });
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
    vi.mocked(fs.writeFileSync).mockReset();
    vi.mocked(fs.statSync).mockReset();
    vi.mocked(getNunjucksEngineForFilePath).mockImplementation(function () {
      return {
        renderString: vi.fn((str) => str),
      } as any;
    });
  });

  describe('constructor and mode determination', () => {
    it('should default to AI Studio mode (vertexai: false)', () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key' },
      });

      expect(provider.id()).toBe('google:gemini-pro');
      expect((provider as any).isVertexMode).toBe(false);
    });

    it('should use Vertex AI mode when vertexai: true', () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { vertexai: true, projectId: 'my-project' },
      });

      expect(provider.id()).toBe('vertex:gemini-pro');
      expect((provider as any).isVertexMode).toBe(true);
    });

    it('should detect Vertex mode from projectId presence', () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { projectId: 'my-project' },
      });

      expect(provider.id()).toBe('vertex:gemini-pro');
      expect((provider as any).isVertexMode).toBe(true);
    });

    it('should detect Vertex mode from credentials presence', () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: {
          credentials: JSON.stringify({ client_email: 'test@test.iam.gserviceaccount.com' }),
        },
      });

      expect(provider.id()).toBe('vertex:gemini-pro');
      expect((provider as any).isVertexMode).toBe(true);
    });

    it('should respect explicit vertexai: false even with projectId', () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: {
          vertexai: false,
          projectId: 'my-project',
          apiKey: 'test-key',
        },
      });

      expect(provider.id()).toBe('google:gemini-pro');
      expect((provider as any).isVertexMode).toBe(false);
    });
  });

  describe('AI Studio mode', () => {
    let provider: GoogleProvider;

    beforeEach(() => {
      provider = new GoogleProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          temperature: 0.7,
          maxOutputTokens: 100,
        },
      });
    });

    it('should resolve API endpoint correctly', () => {
      const endpoint = provider.getApiEndpoint('generateContent');
      expect(endpoint).toContain('/v1beta/models/gemini-pro:generateContent');
      expect(endpoint).toContain('generativelanguage.googleapis.com');
    });

    it('should use v1alpha for thinking models', () => {
      const thinkingProvider = new GoogleProvider('gemini-2.0-flash-thinking-exp', {
        config: { apiKey: 'test-key' },
      });

      const endpoint = thinkingProvider.getApiEndpoint('generateContent');
      expect(endpoint).toContain('/v1alpha/');
    });

    it('should use v1alpha for gemini-3 models', () => {
      const gemini3Provider = new GoogleProvider('gemini-3-pro', {
        config: { apiKey: 'test-key' },
      });

      const endpoint = gemini3Provider.getApiEndpoint('generateContent');
      expect(endpoint).toContain('/v1alpha/');
    });

    it('should allow explicit apiVersion override in AI Studio mode', () => {
      // Test that config.apiVersion takes precedence over auto-detection
      const overrideProvider = new GoogleProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          apiVersion: 'v1', // Override default v1beta
        },
      });

      const endpoint = overrideProvider.getApiEndpoint('generateContent');
      expect(endpoint).toContain('/v1/models/gemini-pro:generateContent');
      expect(endpoint).not.toContain('v1beta');
    });

    it('should use custom apiHost in endpoint', () => {
      const customProvider = new GoogleProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          apiHost: 'custom.host.com',
        },
      });

      const endpoint = customProvider.getApiEndpoint('generateContent');
      expect(endpoint).toContain('https://custom.host.com');
    });

    it('should pass API key in x-goog-api-key header', async () => {
      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'test response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await provider.callApi('test prompt');

      const calledUrl = vi.mocked(cache.fetchWithCache).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('?key=');
      expect(calledUrl).not.toContain('&key=');

      const calledOptions = vi.mocked(cache.fetchWithCache).mock.calls[0][1] as any;
      expect(calledOptions.headers['x-goog-api-key']).toBe('test-key');
    });

    it('should throw error when API key is missing in AI Studio mode', async () => {
      // Delete all possible API key env vars
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.PALM_API_KEY;
      delete process.env.VERTEX_API_KEY;
      // Also delete project-related env vars that would trigger Vertex mode detection
      delete process.env.GOOGLE_PROJECT_ID;
      delete process.env.VERTEX_PROJECT_ID;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GOOGLE_GENAI_USE_VERTEXAI;

      // Explicitly set vertexai: false to ensure AI Studio mode regardless of env vars
      const noKeyProvider = new GoogleProvider('gemini-pro', {
        config: { vertexai: false },
      });

      await expect(noKeyProvider.callApi('test prompt')).rejects.toThrow(
        'Google API key is not set. Set the GOOGLE_API_KEY or GEMINI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    });

    it('should call API and return response', async () => {
      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'Hello, world!' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Hello, world!');
      expect(result.tokenUsage).toEqual({
        prompt: 10,
        completion: 5,
        total: 15,
        numRequests: 1,
      });
    });

    it('should handle safety blocked response', async () => {
      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          promptFeedback: {
            blockReason: 'SAFETY',
            safetyRatings: [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'HIGH' }],
          },
          usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result.guardrails?.flagged).toBe(true);
      expect(result.guardrails?.flaggedInput).toBe(true);
    });
  });

  describe('Vertex AI mode', () => {
    describe('OAuth mode', () => {
      let provider: GoogleProvider;

      beforeEach(() => {
        provider = new GoogleProvider('gemini-pro', {
          config: {
            vertexai: true,
            projectId: 'my-project',
            region: 'us-central1',
          },
        });
      });

      it('should resolve API endpoint correctly', () => {
        const endpoint = provider.getApiEndpoint('generateContent');
        expect(endpoint).toContain('us-central1-aiplatform.googleapis.com');
        expect(endpoint).toContain('/publishers/google/models/gemini-pro:generateContent');
      });

      it('should use global region endpoint when region is global', () => {
        const globalProvider = new GoogleProvider('gemini-pro', {
          config: {
            vertexai: true,
            projectId: 'my-project',
            region: 'global',
          },
        });

        expect(globalProvider.getApiHost()).toBe('aiplatform.googleapis.com');
      });

      it('should call API using Google client for OAuth mode', async () => {
        await provider.callApi('test prompt');

        expect(vi.mocked(util.getGoogleClient)).toHaveBeenCalled();
      });
    });

    describe('Express mode', () => {
      let provider: GoogleProvider;

      beforeEach(() => {
        provider = new GoogleProvider('gemini-pro', {
          config: {
            vertexai: true,
            apiKey: 'vertex-api-key',
            // expressMode not needed - automatic when API key is present
          },
        });
      });

      it('should use express mode automatically when API key is present', () => {
        // Express mode is invisible to users - just provide an API key and it works
        expect((provider as any).isExpressMode()).toBe(true);
      });

      it('should not use express mode when no API key is available', () => {
        const noApiKeyProvider = new GoogleProvider('gemini-pro', {
          config: {
            vertexai: true,
            projectId: 'my-project',
            // No API key - will use OAuth/ADC
          },
        });

        expect((noApiKeyProvider as any).isExpressMode()).toBe(false);
      });

      it('should not use express mode when expressMode: false (opt-out)', () => {
        // Users can explicitly opt-out if they need OAuth features
        const noExpressProvider = new GoogleProvider('gemini-pro', {
          config: {
            vertexai: true,
            apiKey: 'vertex-api-key',
            expressMode: false,
          },
        });

        expect((noExpressProvider as any).isExpressMode()).toBe(false);
      });

      it('should pass API key in header for express mode', async () => {
        const mockResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            candidates: [{ content: { parts: [{ text: 'test response' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
          }),
        };
        vi.mocked(fetchUtil.fetchWithProxy).mockResolvedValueOnce(mockResponse as any);

        await provider.callApi('test prompt');

        const calledUrl = vi.mocked(fetchUtil.fetchWithProxy).mock.calls[0][0] as string;
        expect(calledUrl).not.toContain('?key=');
        expect(calledUrl).not.toContain('&key=');

        const calledOptions = vi.mocked(fetchUtil.fetchWithProxy).mock.calls[0][1] as any;
        expect(calledOptions.headers['x-goog-api-key']).toBe('vertex-api-key');
      });

      it('should use aiplatform.googleapis.com endpoint for express mode', async () => {
        const mockResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            candidates: [{ content: { parts: [{ text: 'test response' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
          }),
        };
        vi.mocked(fetchUtil.fetchWithProxy).mockResolvedValueOnce(mockResponse as any);

        await provider.callApi('test prompt');

        const calledUrl = vi.mocked(fetchUtil.fetchWithProxy).mock.calls[0][0] as string;
        expect(calledUrl).toContain('aiplatform.googleapis.com');
        expect(calledUrl).toContain('/publishers/google/models/gemini-pro:generateContent');
      });
    });
  });

  describe('response parsing', () => {
    let provider: GoogleProvider;

    beforeEach(() => {
      provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key' },
      });
    });

    it('should handle cached response', async () => {
      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'cached response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
        cached: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result.cached).toBe(true);
      expect(result.tokenUsage).toEqual({
        cached: 15,
        total: 15,
        numRequests: 0,
      });
    });

    it('should extract grounding metadata from response', async () => {
      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [
            {
              content: { parts: [{ text: 'response with grounding' }] },
              groundingMetadata: { searchQueries: ['test query'] },
              webSearchQueries: ['test search'],
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result.metadata?.groundingMetadata).toEqual({ searchQueries: ['test query'] });
      expect(result.metadata?.webSearchQueries).toEqual(['test search']);
    });

    it('should handle Model Armor block reason', async () => {
      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          promptFeedback: {
            blockReason: 'MODEL_ARMOR',
            blockReasonMessage: 'Content blocked by Model Armor',
          },
          usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result.guardrails?.flagged).toBe(true);
      expect(result.metadata?.modelArmor?.blockReason).toBe('MODEL_ARMOR');
    });

    it('should handle MAX_TOKENS finish reason as success', async () => {
      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [
            {
              content: { parts: [{ text: 'truncated response' }] },
              finishReason: 'MAX_TOKENS',
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 100, totalTokenCount: 110 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('truncated response');
    });

    it('should handle thinking tokens in response', async () => {
      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'thinking response' }] } }],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
            thoughtsTokenCount: 100,
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result.tokenUsage?.completionDetails?.reasoning).toBe(100);
    });
  });

  describe('cost calculation', () => {
    it('should return cost for AI Studio mode with known model', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      // gemini-pro: input=0.5/1e6, output=1.5/1e6
      // cost = 0.5e-6 * 10 + 1.5e-6 * 5 = 1.25e-5
      expect(result.cost).toBeCloseTo(1.25e-5, 10);
    });

    it('should return undefined cost for Vertex AI mode', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { vertexai: true, projectId: 'my-project' },
      });

      await provider.callApi('test prompt');

      // getGoogleClient mock returns default response with usageMetadata
      // but cost should be undefined because Vertex AI pricing differs
      const result = await provider.callApi('test prompt');
      expect(result.cost).toBeUndefined();
    });

    it('should return undefined cost for cached responses', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'cached response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
        cached: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result.cost).toBeUndefined();
    });

    it('should use tiered pricing when prompt tokens exceed threshold', async () => {
      const provider = new GoogleProvider('gemini-2.5-pro', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
          usageMetadata: {
            promptTokenCount: 250_000,
            candidatesTokenCount: 1000,
            totalTokenCount: 251_000,
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      // gemini-2.5-pro tiered: input=2.5/1e6, output=15.0/1e6 (above 200k threshold)
      // cost = 2.5e-6 * 250000 + 15.0e-6 * 1000 = 0.625 + 0.015 = 0.64
      expect(result.cost).toBeCloseTo(0.64, 5);
    });

    it('should use standard pricing when prompt tokens are below threshold', async () => {
      const provider = new GoogleProvider('gemini-2.5-pro', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
          usageMetadata: {
            promptTokenCount: 100_000,
            candidatesTokenCount: 1000,
            totalTokenCount: 101_000,
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      // gemini-2.5-pro standard: input=1.25/1e6, output=10.0/1e6 (below 200k threshold)
      // cost = 1.25e-6 * 100000 + 10.0e-6 * 1000 = 0.125 + 0.01 = 0.135
      expect(result.cost).toBeCloseTo(0.135, 5);
    });

    it('should use config.cost override when provided', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', cost: 0.001 },
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      // config.cost=0.001 applied to both input and output
      // cost = 0.001 * 100 + 0.001 * 50 = 0.15
      expect(result.cost).toBeCloseTo(0.15, 5);
    });
  });

  describe('tool handling', () => {
    it('should include tools in request body', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'test_function',
                  description: 'A test function',
                  parameters: { type: 'OBJECT', properties: {} },
                },
              ],
            },
          ],
        },
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await provider.callApi('test prompt');

      const calledOptions = vi.mocked(cache.fetchWithCache).mock.calls[0][1] as any;
      const body = JSON.parse(calledOptions.body);
      expect(body.tools).toBeDefined();
      expect(body.tools[0].functionDeclarations[0].name).toBe('test_function');
    });

    it('should include toolConfig in request body', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          toolConfig: {
            functionCallingConfig: {
              mode: 'ANY',
            },
          },
        },
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await provider.callApi('test prompt');

      const calledOptions = vi.mocked(cache.fetchWithCache).mock.calls[0][1] as any;
      const body = JSON.parse(calledOptions.body);
      expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
    });
  });

  describe('error handling', () => {
    let provider: GoogleProvider;

    beforeEach(() => {
      provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key' },
      });
    });

    it('should return error for API call failure', async () => {
      vi.mocked(cache.fetchWithCache).mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('API call error');
      expect(result.error).toContain('Network error');
    });

    it('should return error for API error response', async () => {
      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          error: {
            code: 400,
            message: 'Invalid request',
          },
        },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Error 400: Invalid request');
    });

    it('should handle express mode API error response', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: {
          vertexai: true,
          apiKey: 'vertex-api-key',
          expressMode: true, // Explicit for test clarity; auto-enabled when apiKey is present
        },
      });

      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({ error: { message: 'Invalid API key' } }),
      };
      vi.mocked(fetchUtil.fetchWithProxy).mockResolvedValueOnce(mockResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('API call error: 401 Unauthorized');
    });
  });

  describe('cleanup', () => {
    it('should have cleanup method', () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key' },
      });

      expect(typeof provider.cleanup).toBe('function');
    });
  });
});
