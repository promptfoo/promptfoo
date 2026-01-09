import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQuiverAiProvider,
  QuiverAiChatProvider,
  QuiverAiSvgProvider,
} from '../../src/providers/quiverai';
import * as cache from '../../src/cache';

vi.mock('../../src/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cache')>();
  return {
    ...actual,
    fetchWithCache: vi.fn(),
  };
});

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x) => x),
    renderVarsInObject: vi.fn((x) => x),
  };
});

describe('QuiverAI Provider', () => {
  const mockedFetchWithCache = vi.mocked(cache.fetchWithCache);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.QUIVERAI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.QUIVERAI_API_KEY;
    vi.resetAllMocks();
  });

  // ============================================
  // CHAT PROVIDER TESTS
  // ============================================

  describe('QuiverAiChatProvider', () => {
    it('should initialize with correct model name', () => {
      const provider = new QuiverAiChatProvider('arrow-0.5', {});
      expect(provider.modelName).toBe('arrow-0.5');
    });

    it('should return correct provider id', () => {
      const provider = new QuiverAiChatProvider('arrow-0.5', {});
      expect(provider.id()).toBe('quiverai:arrow-0.5');
    });

    it('should return correct string representation', () => {
      const provider = new QuiverAiChatProvider('arrow-0.5', {});
      expect(provider.toString()).toBe('[QuiverAI Provider arrow-0.5]');
    });

    it('should use correct API base URL', () => {
      const provider = new QuiverAiChatProvider('arrow-0.5', {});
      expect(provider.getApiUrlDefault()).toBe('https://api.quiver.ai/v1');
    });

    it('should pass through reasoning_effort config', () => {
      const provider = new QuiverAiChatProvider('arrow-0.5', {
        config: {
          reasoning_effort: 'high',
        },
      });
      expect(provider.config.passthrough).toEqual({ reasoning_effort: 'high' });
    });
  });

  // ============================================
  // SVG PROVIDER TESTS
  // ============================================

  describe('QuiverAiSvgProvider', () => {
    describe('constructor and configuration', () => {
      it('should create provider with default model name', () => {
        const provider = new QuiverAiSvgProvider('', {});
        expect(provider.modelName).toBe('arrow-0.5');
      });

      it('should create provider with specified model name', () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5-preview', {});
        expect(provider.modelName).toBe('arrow-0.5-preview');
      });

      it('should use config apiKey over env var', () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {
          config: { apiKey: 'config-api-key' },
        });
        // Access private method via callApi error path
        expect(provider.config.apiKey).toBe('config-api-key');
      });
    });

    describe('provider identification', () => {
      it('should return correct provider id', () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});
        expect(provider.id()).toBe('quiverai:svg:arrow-0.5');
      });

      it('should return correct string representation', () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});
        expect(provider.toString()).toBe('[QuiverAI SVG Provider arrow-0.5]');
      });
    });

    describe('API key validation', () => {
      it('should return error when API key is not set', async () => {
        delete process.env.QUIVERAI_API_KEY;
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        const result = await provider.callApi('test prompt');

        expect(result.error).toContain('QuiverAI API key not set');
      });

      it('should use env override for API key', async () => {
        delete process.env.QUIVERAI_API_KEY;
        const provider = new QuiverAiSvgProvider('arrow-0.5', {
          env: { QUIVERAI_API_KEY: 'env-override-key' },
        });

        const mockResponse = {
          data: [{ svg: '<svg></svg>' }],
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        };

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        await provider.callApi('test prompt');

        expect(mockedFetchWithCache).toHaveBeenCalledWith(
          'https://api.quiver.ai/v1/svg/generate',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer env-override-key',
            }),
          }),
          expect.any(Number),
        );
      });
    });

    describe('SVG generation', () => {
      const mockSvgResponse = {
        data: [{ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>' }],
        usage: { input_tokens: 50, output_tokens: 100, total_tokens: 150 },
      };

      it('should call /svg/generate endpoint for generate operation', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockSvgResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        await provider.callApi('a simple home icon');

        expect(mockedFetchWithCache).toHaveBeenCalledWith(
          'https://api.quiver.ai/v1/svg/generate',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-api-key',
            }),
          }),
          expect.any(Number),
        );
      });

      it('should return SVG as base64 markdown image', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockSvgResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const result = await provider.callApi('a simple home icon');

        expect(result.output).toMatch(/^!\[.*\]\(data:image\/svg\+xml;base64,.*\)$/);
        expect(result.cached).toBe(false);
      });

      it('should include token usage in response', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockSvgResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const result = await provider.callApi('a simple home icon');

        expect(result.tokenUsage).toEqual({
          prompt: 50,
          completion: 100,
          total: 150,
        });
      });

      it('should calculate cost based on token usage', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockSvgResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const result = await provider.callApi('a simple home icon');

        // Cost: 50 * 0.000001 + 100 * 0.000002 = 0.00005 + 0.0002 = 0.00025
        expect(result.cost).toBeCloseTo(0.00025, 6);
      });

      it('should return zero cost for cached responses', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockSvgResponse,
          cached: true,
          status: 200,
          statusText: 'OK',
        });

        const result = await provider.callApi('a simple home icon');

        expect(result.cached).toBe(true);
        expect(result.cost).toBe(0);
      });

      it('should pass svgParams to API', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {
          config: {
            svgParams: {
              mode: 'icon',
              style: 'outline',
              complexity: 2,
              viewBox: { width: 24, height: 24 },
            },
          },
        });

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockSvgResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        await provider.callApi('a simple home icon');

        const callArgs = mockedFetchWithCache.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]!.body as string);

        expect(requestBody.svg_params).toEqual({
          mode: 'icon',
          design: {
            style_preset: 'outline',
            complexity: 2,
          },
          canvas: {
            view_box: { width: 24, height: 24 },
          },
        });
      });

      it('should pass temperature and maxOutputTokens to API', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {
          config: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        });

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockSvgResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        await provider.callApi('test prompt');

        const callArgs = mockedFetchWithCache.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]!.body as string);

        expect(requestBody.temperature).toBe(0.7);
        expect(requestBody.max_output_tokens).toBe(2048);
      });
    });

    describe('SVG editing', () => {
      const mockEditResponse = {
        data: [{ svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle fill="red"/></svg>' }],
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      };

      it('should call /svg/edits endpoint for edit operation', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {
          config: {
            operation: 'edit',
            sourceSvg: '<svg><circle/></svg>',
          },
        });

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockEditResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        await provider.callApi('make the circle red');

        expect(mockedFetchWithCache).toHaveBeenCalledWith(
          'https://api.quiver.ai/v1/svg/edits',
          expect.any(Object),
          expect.any(Number),
        );
      });

      it('should include source SVG in edit request body', async () => {
        const sourceSvg = '<svg><circle/></svg>';
        const provider = new QuiverAiSvgProvider('arrow-0.5', {
          config: {
            operation: 'edit',
            sourceSvg,
          },
        });

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockEditResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        await provider.callApi('make it colorful');

        const callArgs = mockedFetchWithCache.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]!.body as string);

        expect(requestBody.input).toEqual({
          prompt: 'make it colorful',
          source: { svg: sourceSvg },
        });
      });

      it('should use sourceSvgUrl when provided', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {
          config: {
            operation: 'edit',
            sourceSvgUrl: 'https://example.com/icon.svg',
          },
        });

        mockedFetchWithCache.mockResolvedValueOnce({
          data: mockEditResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        await provider.callApi('make it colorful');

        const callArgs = mockedFetchWithCache.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]!.body as string);

        expect(requestBody.input.source).toEqual({
          svg_url: 'https://example.com/icon.svg',
        });
      });

      it('should throw error when edit operation has no source', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {
          config: {
            operation: 'edit',
            // No sourceSvg or sourceSvgUrl
          },
        });

        const result = await provider.callApi('make it colorful');

        expect(result.error).toContain('SVG edit operation requires sourceSvg or sourceSvgUrl');
      });
    });

    describe('error handling', () => {
      it('should handle API errors', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockResolvedValueOnce({
          data: { error: { message: 'Invalid request' } },
          cached: false,
          status: 400,
          statusText: 'Bad Request',
        });

        const result = await provider.callApi('test prompt');

        expect(result.error).toContain('400 Bad Request');
      });

      it('should handle API error in response body', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockResolvedValueOnce({
          data: { error: { message: 'Rate limit exceeded', code: 'rate_limit' } },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const result = await provider.callApi('test prompt');

        expect(result.error).toContain('rate_limit');
      });

      it('should handle missing SVG data in response', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockResolvedValueOnce({
          data: { data: [] },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const result = await provider.callApi('test prompt');

        expect(result.error).toContain('No SVG data in response');
      });

      it('should handle network errors', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockRejectedValueOnce(new Error('Network error'));

        const result = await provider.callApi('test prompt');

        expect(result.error).toContain('Network error');
      });
    });

    describe('prompt sanitization', () => {
      it('should sanitize brackets in prompt for markdown output', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockResolvedValueOnce({
          data: { data: [{ svg: '<svg></svg>' }] },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const result = await provider.callApi('icon [test] with brackets');

        // Brackets should be replaced with parentheses
        expect(result.output).toContain('![icon (test) with brackets]');
      });

      it('should truncate long prompts in markdown output', async () => {
        const provider = new QuiverAiSvgProvider('arrow-0.5', {});

        mockedFetchWithCache.mockResolvedValueOnce({
          data: { data: [{ svg: '<svg></svg>' }] },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const longPrompt = 'a'.repeat(100);
        const result = await provider.callApi(longPrompt);

        // Should be truncated to 50 chars
        expect((result.output as string).split('](')[0].length).toBeLessThanOrEqual(52 + 2); // ![...
      });
    });
  });

  // ============================================
  // FACTORY FUNCTION TESTS
  // ============================================

  describe('createQuiverAiProvider', () => {
    it('should create chat provider for quiverai:model format', () => {
      const provider = createQuiverAiProvider('quiverai:arrow-0.5');
      expect(provider).toBeInstanceOf(QuiverAiChatProvider);
      expect(provider.id()).toBe('quiverai:arrow-0.5');
    });

    it('should create chat provider for quiverai:chat:model format', () => {
      const provider = createQuiverAiProvider('quiverai:chat:arrow-0.5');
      expect(provider).toBeInstanceOf(QuiverAiChatProvider);
      expect(provider.id()).toBe('quiverai:arrow-0.5');
    });

    it('should create SVG provider for quiverai:svg:model format', () => {
      const provider = createQuiverAiProvider('quiverai:svg:arrow-0.5');
      expect(provider).toBeInstanceOf(QuiverAiSvgProvider);
      expect(provider.id()).toBe('quiverai:svg:arrow-0.5');
    });

    it('should use default model when not specified', () => {
      const provider = createQuiverAiProvider('quiverai:');
      expect(provider).toBeInstanceOf(QuiverAiChatProvider);
    });

    it('should use default model for SVG when not specified', () => {
      const provider = createQuiverAiProvider('quiverai:svg:');
      expect(provider).toBeInstanceOf(QuiverAiSvgProvider);
      expect(provider.id()).toBe('quiverai:svg:arrow-0.5');
    });

    it('should pass config to providers', () => {
      const provider = createQuiverAiProvider('quiverai:svg:arrow-0.5', {
        config: {
          temperature: 0.5,
        },
      }) as QuiverAiSvgProvider;

      expect(provider.config.temperature).toBe(0.5);
    });

    it('should pass env overrides to SVG provider', () => {
      const provider = createQuiverAiProvider(
        'quiverai:svg:arrow-0.5',
        {},
        { QUIVERAI_API_KEY: 'override-key' },
      ) as QuiverAiSvgProvider;

      expect(provider.env?.QUIVERAI_API_KEY).toBe('override-key');
    });
  });
});
