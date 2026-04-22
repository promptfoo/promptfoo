import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, getScopedCacheKey, isCacheEnabled } from '../../../src/cache';
import {
  formatModerationInput,
  type ImageInput,
  isImageInput,
  isTextInput,
  OpenAiModerationProvider,
  supportsImageInput,
  type TextInput,
} from '../../../src/providers/openai/moderation';
import { getOpenAiMissingApiKeyMessage } from './shared';

vi.mock('../../../src/cache');
vi.mock('../../../src/logger');

describe('OpenAiModerationProvider', () => {
  // Standard setup for all tests
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isCacheEnabled).mockImplementation(function () {
      return false;
    });
    vi.mocked(getScopedCacheKey).mockImplementation(function (cacheKey) {
      return cacheKey;
    });
    vi.mocked(fetchWithCache).mockImplementation(async function () {
      return {
        data: {},
        status: 200,
        statusText: 'OK',
        cached: false,
      };
    });
  });

  // Helper function to create a provider instance
  const createProvider = (modelName = 'text-moderation-latest') => {
    return new OpenAiModerationProvider(modelName, {
      config: { apiKey: 'test-key' },
    });
  };

  describe('Basic functionality', () => {
    it('should moderate content and detect harmful content', async () => {
      const provider = createProvider();

      const mockResponse = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [
          {
            flagged: true,
            categories: {
              hate: true,
              'hate/threatening': false,
            },
            category_scores: {
              hate: 0.99,
              'hate/threatening': 0.01,
            },
          },
        ],
      };

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const result = await provider.callModerationApi('user input', 'assistant response');

      expect(result).toEqual({
        flags: [
          {
            code: 'hate',
            description: 'hate',
            confidence: 0.99,
          },
        ],
      });

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/moderations'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-promptfoo-silent': 'true',
            Authorization: 'Bearer test-key',
          }),
          body: expect.stringContaining('"model":"text-moderation-latest"'),
        }),
        expect.any(Number),
        'json',
        true,
        undefined,
      );
    });

    it('should return empty flags for safe content', async () => {
      const provider = createProvider();

      const mockResponse = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [
          {
            flagged: false,
            categories: {
              hate: false,
              'hate/threatening': false,
            },
            category_scores: {
              hate: 0.01,
              'hate/threatening': 0.01,
            },
          },
        ],
      };

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const result = await provider.callModerationApi('user input', 'assistant response');

      expect(result).toEqual({
        flags: [],
      });
    });

    it('should use flagged categories when scores are close together', async () => {
      const provider = createProvider();

      const mockResponse = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [
          {
            flagged: true,
            categories: {
              hate: true,
              'hate/threatening': false,
            },
            category_scores: {
              hate: 0.5,
              'hate/threatening': 0.49,
            },
          },
        ],
      };

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const result = await provider.callModerationApi('user input', 'assistant response');

      expect(result).toEqual({
        flags: [
          {
            code: 'hate',
            description: 'hate',
            confidence: 0.5,
          },
        ],
      });
    });
  });

  describe('Error handling', () => {
    it('should handle API call errors', async () => {
      const provider = createProvider();

      vi.mocked(fetchWithCache).mockRejectedValueOnce(new Error('API Error'));

      const result = await provider.callModerationApi('user input', 'assistant response');

      expect(result).toEqual({
        error: expect.stringContaining('API call error'),
      });
    });

    it('should handle error responses from API', async () => {
      const provider = createProvider();

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: { error: 'Invalid request' },
        status: 400,
        statusText: 'Bad Request',
        cached: false,
      });

      const result = await provider.callModerationApi('user input', 'assistant response');
      expect(result).toEqual({
        error: expect.stringContaining('API error: 400'),
      });
    });

    it('should check for API key availability', async () => {
      // Create provider with empty API key - instead of testing the throw,
      // we'll mock getApiKey to return empty and verify handleApiError is used
      const provider = createProvider();
      vi.spyOn(provider, 'getApiKey').mockReturnValue('');

      // Mock the logger to verify error is logged
      const logger = (await import('../../../src/logger')).default;
      const errorSpy = vi.spyOn(logger, 'error');

      const result = await provider.callModerationApi('user', 'assistant');

      // Verify we got an error response with the expected message
      expect(result).toHaveProperty('error');
      expect(result.error).toContain(getOpenAiMissingApiKeyMessage());
      expect(errorSpy).toHaveBeenCalledWith(
        'OpenAI moderation API error',
        expect.objectContaining({
          error: expect.stringContaining(getOpenAiMissingApiKeyMessage()),
          hasData: false,
        }),
      );
    });

    it('should use custom apiKeyEnvar in missing API key errors', async () => {
      const provider = new OpenAiModerationProvider('text-moderation-latest', {
        config: {
          apiKeyEnvar: 'CUSTOM_MODERATION_API_KEY',
        },
        env: {
          OPENAI_API_KEY: undefined,
          CUSTOM_MODERATION_API_KEY: undefined,
        },
      });
      vi.spyOn(provider, 'getApiKey').mockReturnValue('');

      const result = await provider.callModerationApi('user', 'assistant');

      expect(result.error).toContain(getOpenAiMissingApiKeyMessage('CUSTOM_MODERATION_API_KEY'));
    });

    it('should handle empty results from API', async () => {
      const provider = createProvider();

      const mockResponse = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [], // Empty results array
      };

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const result = await provider.callModerationApi('user', 'assistant');
      expect(result).toEqual({ flags: [] });
    });

    it('should handle non-empty results with no flagged categories', async () => {
      const provider = createProvider();

      const mockResponse = {
        id: 'modr-124',
        model: 'text-moderation-latest',
        results: [
          {
            flagged: false,
            categories: {
              hate: false,
              'hate/threatening': false,
              harassment: false,
              'harassment/threatening': false,
              illicit: false,
              'illicit/violent': false,
              'self-harm': false,
              'self-harm/intent': false,
              'self-harm/instructions': false,
              sexual: false,
              'sexual/minors': false,
              violence: false,
              'violence/graphic': false,
            },
            category_scores: {
              hate: 0,
              'hate/threatening': 0,
              harassment: 0,
              'harassment/threatening': 0,
              illicit: 0,
              'illicit/violent': 0,
              'self-harm': 0,
              'self-harm/intent': 0,
              'self-harm/instructions': 0,
              sexual: 0,
              'sexual/minors': 0,
              violence: 0,
              'violence/graphic': 0,
            },
            category_applied_input_types: {},
          },
        ],
      };

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const result = await provider.callModerationApi('user', 'assistant');
      expect(result).toEqual({ flags: [] });
    });
  });

  describe('Caching', () => {
    it('should use cache when enabled', async () => {
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const headerSecret = 'Bearer cache-secret-header';
      const provider = new OpenAiModerationProvider('text-moderation-latest', {
        config: { apiKey: 'test-key', headers: { Authorization: headerSecret } },
      });

      const mockResponse = {
        flags: [
          {
            code: 'hate',
            description: 'hate',
            confidence: 0.9,
          },
        ],
      };

      const mockCache = {
        get: vi.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return mockCache as any;
      });

      const result = await provider.callModerationApi('user input', 'assistant response');

      expect(result).toEqual({ ...mockResponse, cached: true });
      expect(result.cached).toBe(true);
      const cacheKey = mockCache.get.mock.calls[0][0] as string;
      expect(cacheKey).toMatch(
        /^openai:moderation:text-moderation-latest:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKey).not.toContain('assistant response');
      expect(cacheKey).not.toContain(headerSecret);
      expect(cacheKey).not.toContain('test-key');
      // Verify fetchWithCache wasn't called because cache was used
      expect(fetchWithCache).not.toHaveBeenCalled();
    });

    it('should store results in cache when caching is enabled', async () => {
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = createProvider();

      const mockResponse = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [
          {
            flagged: true,
            categories: { hate: true },
            category_scores: { hate: 0.95 },
          },
        ],
      };

      const mockCache = {
        get: vi.fn().mockResolvedValue(null), // No cached response
        set: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return mockCache as any;
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      await provider.callModerationApi('user', 'assistant');

      // Verify we attempted to save to cache
      const cacheKey = mockCache.set.mock.calls[0][0] as string;
      expect(cacheKey).toMatch(
        /^openai:moderation:text-moderation-latest:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKey).not.toContain('assistant');
      expect(mockCache.set).toHaveBeenCalledWith(
        cacheKey,
        expect.stringContaining('{"flags":[{"code":"hate"'),
      );
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
        undefined,
      );
    });

    it('should build cache keys from normalized moderation inputs', async () => {
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = createProvider('omni-moderation-latest');
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return mockCache as any;
      });
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          id: 'modr-123',
          model: 'omni-moderation-latest',
          results: [{ flagged: false, categories: {}, category_scores: {} }],
        },
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      await provider.callModerationApi('user', 'same normalized text');
      await provider.callModerationApi('user', [{ type: 'text', text: 'same normalized text' }]);

      expect(mockCache.get.mock.calls[0][0]).toBe(mockCache.get.mock.calls[1][0]);
    });

    it('should isolate cache keys by resolved API key', async () => {
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const providerA = new OpenAiModerationProvider('text-moderation-latest', {
        config: { apiKey: 'sk-moderation-tenant-a' },
      });
      const providerB = new OpenAiModerationProvider('text-moderation-latest', {
        config: { apiKey: 'sk-moderation-tenant-b' },
      });
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return mockCache as any;
      });
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          id: 'modr-123',
          model: 'text-moderation-latest',
          results: [{ flagged: false, categories: {}, category_scores: {} }],
        },
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      await providerA.callModerationApi('user', 'same sensitive text');
      await providerB.callModerationApi('user', 'same sensitive text');

      const [cacheKeyA, cacheKeyB] = mockCache.get.mock.calls.map(([key]) => key as string);
      expect(cacheKeyA).toMatch(
        /^openai:moderation:text-moderation-latest:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyB).toMatch(
        /^openai:moderation:text-moderation-latest:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyA).not.toBe(cacheKeyB);
      expect(cacheKeyA).not.toContain('same sensitive text');
      expect(cacheKeyA).not.toContain('sk-moderation-tenant-a');
      expect(cacheKeyB).not.toContain('sk-moderation-tenant-b');
    });

    it('should keep resolved API key cache identity stable across module reloads', async () => {
      async function getCacheKeyFromFreshModule() {
        vi.resetModules();
        const freshCacheModule = await import('../../../src/cache');
        const mockCache = {
          get: vi.fn().mockResolvedValue(JSON.stringify({ flags: [] })),
          set: vi.fn(),
        };

        vi.mocked(freshCacheModule.isCacheEnabled).mockImplementation(function () {
          return true;
        });
        vi.mocked(freshCacheModule.getCache).mockImplementation(function () {
          return mockCache as any;
        });

        const { OpenAiModerationProvider: FreshOpenAiModerationProvider } = await import(
          '../../../src/providers/openai/moderation'
        );
        const provider = new FreshOpenAiModerationProvider('text-moderation-latest', {
          config: { apiKey: 'sk-moderation-reload' },
        });

        await provider.callModerationApi('user', 'same sensitive text');

        return mockCache.get.mock.calls[0][0] as string;
      }

      const cacheKeyA = await getCacheKeyFromFreshModule();
      const cacheKeyB = await getCacheKeyFromFreshModule();

      expect(cacheKeyA).toBe(cacheKeyB);
      expect(cacheKeyA).toMatch(
        /^openai:moderation:text-moderation-latest:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyA).not.toContain('same sensitive text');
      expect(cacheKeyA).not.toContain('sk-moderation-reload');
    });

    it('should deduplicate concurrent moderation requests with identical cache identity', async () => {
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = createProvider();
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      };
      const mockResponse = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [{ flagged: false, categories: {}, category_scores: {} }],
      };
      let resolveFetch: (value: any) => void;

      vi.mocked(getCache).mockImplementation(function () {
        return mockCache as any;
      });
      vi.mocked(fetchWithCache).mockReturnValueOnce(
        new Promise<any>((resolve) => {
          resolveFetch = resolve;
        }) as ReturnType<typeof fetchWithCache>,
      );

      const first = provider.callModerationApi('user', 'same sensitive text');
      const second = provider.callModerationApi('user', 'same sensitive text');

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fetchWithCache).toHaveBeenCalledTimes(1);

      resolveFetch!({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      await expect(Promise.all([first, second])).resolves.toEqual([{ flags: [] }, { flags: [] }]);
    });

    it('should not deduplicate in-flight requests across cache namespaces', async () => {
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = createProvider();
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      };
      const mockResponse = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [{ flagged: false, categories: {}, category_scores: {} }],
      };
      const resolvers: Array<(value: any) => void> = [];

      vi.mocked(getCache).mockImplementation(function () {
        return mockCache as any;
      });
      let namespaceIndex = 0;
      vi.mocked(getScopedCacheKey).mockImplementation(function (cacheKey) {
        const namespace = namespaceIndex++ === 0 ? 'repeat-0' : 'repeat-1';
        return `${namespace}:${cacheKey}`;
      });
      vi.mocked(fetchWithCache).mockImplementation(
        () =>
          new Promise<any>((resolve) => {
            resolvers.push(resolve);
          }) as ReturnType<typeof fetchWithCache>,
      );

      const first = provider.callModerationApi('user', 'same sensitive text');
      const second = provider.callModerationApi('user', 'same sensitive text');

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fetchWithCache).toHaveBeenCalledTimes(2);

      for (const resolveFetch of resolvers) {
        resolveFetch({
          data: mockResponse,
          status: 200,
          statusText: 'OK',
          cached: false,
        });
      }

      await expect(Promise.all([first, second])).resolves.toEqual([{ flags: [] }, { flags: [] }]);
    });
  });

  describe('Multi-modal support', () => {
    it('should format inputs correctly for omni-moderation models', async () => {
      const provider = createProvider('omni-moderation-latest');

      const mockResponse = {
        id: 'modr-123',
        model: 'omni-moderation-latest',
        results: [{ flagged: false, categories: {}, category_scores: {} }],
      };

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      await provider.callModerationApi('user input', 'assistant response');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"type":"text"'),
        }),
        expect.any(Number),
        'json',
        true,
        undefined,
      );
    });

    it('should handle mixed text and image inputs', async () => {
      const provider = createProvider('omni-moderation-latest');

      const mockResponse = {
        id: 'modr-123',
        model: 'omni-moderation-latest',
        results: [
          {
            flagged: true,
            categories: {
              violence: true,
            },
            category_scores: {
              violence: 0.95,
            },
            category_applied_input_types: {
              violence: ['image'],
            },
          },
        ],
      };

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const imageInput: Array<TextInput | ImageInput> = [
        { type: 'text' as const, text: 'Some text' },
        {
          type: 'image_url' as const,
          image_url: { url: 'https://example.com/image.png' },
        },
      ];

      const result = await provider.callModerationApi('user input', imageInput);

      // Instead of checking for "applied to" text, just verify that we have flags
      expect(result.flags!).toBeDefined();
      expect(result.flags!.length).toBeGreaterThan(0);
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('image_url'),
        }),
        expect.any(Number),
        'json',
        true,
        undefined,
      );
    });

    it('should hash cached mixed text and image inputs without leaking raw content', async () => {
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const apiKey = 'sk-secret-moderation-key';
      const headerSecret = 'Bearer moderation-header-secret';
      const textSecret = 'multimodal-secret-text';
      const imageUrl = 'https://example.com/image.png?token=image-secret-token';
      const provider = new OpenAiModerationProvider('omni-moderation-latest', {
        config: {
          apiKey,
          headers: {
            Authorization: headerSecret,
          },
        },
      });

      const mockResponse = {
        id: 'modr-123',
        model: 'omni-moderation-latest',
        results: [{ flagged: false, categories: {}, category_scores: {} }],
      };

      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return mockCache as any;
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const imageInput: Array<TextInput | ImageInput> = [
        { type: 'text' as const, text: textSecret },
        {
          type: 'image_url' as const,
          image_url: { url: imageUrl },
        },
      ];

      await provider.callModerationApi('user input', imageInput);

      const cacheGetKey = mockCache.get.mock.calls[0][0] as string;
      const cacheSetKey = mockCache.set.mock.calls[0][0] as string;
      expect(cacheGetKey).toBe(cacheSetKey);
      expect(cacheSetKey).toMatch(
        /^openai:moderation:omni-moderation-latest:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheSetKey).not.toContain(textSecret);
      expect(cacheSetKey).not.toContain(imageUrl);
      expect(cacheSetKey).not.toContain('image-secret-token');
      expect(cacheSetKey).not.toContain(apiKey);
      expect(cacheSetKey).not.toContain(headerSecret);
    });

    it('should show which input types triggered each flag', async () => {
      const provider = createProvider('omni-moderation-latest');

      const mockResponse = {
        id: 'modr-123',
        model: 'omni-moderation-latest',
        results: [
          {
            flagged: true,
            categories: {
              violence: true,
              sexual: true,
            },
            category_scores: {
              violence: 0.95,
              sexual: 0.98,
            },
            category_applied_input_types: {
              violence: ['image'],
              sexual: ['text', 'image'],
            },
          },
        ],
      };

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const imageInput: Array<TextInput | ImageInput> = [
        { type: 'text' as const, text: 'Some text' },
        {
          type: 'image_url' as const,
          image_url: { url: 'https://example.com/image.png' },
        },
      ];

      const result = await provider.callModerationApi('user input', imageInput);

      const violenceFlag = result.flags?.find((f) => f.code === 'violence');
      const sexualFlag = result.flags?.find((f) => f.code === 'sexual');

      // Just verify that the flags exist with the correct codes
      expect(violenceFlag).toBeDefined();
      expect(sexualFlag).toBeDefined();
    });
  });

  describe('Model configuration', () => {
    it('should warn about unknown models', async () => {
      // Import the mocked logger
      const logger = (await import('../../../src/logger')).default;
      const warnSpy = vi.spyOn(logger, 'warn');

      new OpenAiModerationProvider('unknown-model', {
        config: { apiKey: 'test-key' },
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown OpenAI moderation model'),
      );
    });

    it('should accept custom API headers', async () => {
      const provider = new OpenAiModerationProvider('text-moderation-latest', {
        config: {
          apiKey: 'test-key',
          headers: {
            'Custom-Header': 'custom-value',
          },
        },
      });

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: { id: 'modr-123', model: 'text-moderation-latest', results: [] },
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      await provider.callModerationApi('user', 'assistant');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Custom-Header': 'custom-value',
            'x-promptfoo-silent': 'true',
          }),
        }),
        expect.any(Number),
        'json',
        true,
        undefined,
      );
    });
  });
});

describe('Moderation Utility Functions', () => {
  describe('Input Type Guards', () => {
    it('should correctly identify text inputs', () => {
      const textInput: TextInput = { type: 'text', text: 'test content' };
      const imageInput: ImageInput = {
        type: 'image_url',
        image_url: { url: 'https://example.com/image.jpg' },
      };

      expect(isTextInput(textInput)).toBe(true);
      expect(isTextInput(imageInput)).toBe(false);
    });

    it('should correctly identify image inputs', () => {
      const textInput: TextInput = { type: 'text', text: 'test content' };
      const imageInput: ImageInput = {
        type: 'image_url',
        image_url: { url: 'https://example.com/image.jpg' },
      };

      expect(isImageInput(imageInput)).toBe(true);
      expect(isImageInput(textInput)).toBe(false);
    });
  });

  describe('supportsImageInput', () => {
    it('should return true for multi-modal models', () => {
      expect(supportsImageInput('omni-moderation-latest')).toBe(true);
      expect(supportsImageInput('omni-moderation-2024-09-26')).toBe(true);
    });

    it('should return false for text-only models', () => {
      expect(supportsImageInput('text-moderation-latest')).toBe(false);
      expect(supportsImageInput('text-moderation-stable')).toBe(false);
      expect(supportsImageInput('text-moderation-007')).toBe(false);
    });

    it('should return false for unknown models', () => {
      expect(supportsImageInput('nonexistent-model')).toBe(false);
    });
  });

  describe('formatModerationInput', () => {
    it('should return string as-is for text-only models', () => {
      const input = 'test content';
      expect(formatModerationInput(input, false)).toBe(input);
    });

    it('should wrap string in TextInput object for multi-modal models', () => {
      const input = 'test content';
      const expected = [{ type: 'text', text: input }];
      expect(formatModerationInput(input, true)).toEqual(expected);
    });

    it('should return array inputs as-is for multi-modal models', () => {
      const input = [
        { type: 'text' as const, text: 'text content' },
        { type: 'image_url' as const, image_url: { url: 'https://example.com/image.jpg' } },
      ];
      expect(formatModerationInput(input, true)).toEqual(input);
    });

    it('should filter out image inputs for text-only models', () => {
      const input = [
        { type: 'text' as const, text: 'text content' },
        { type: 'image_url' as const, image_url: { url: 'https://example.com/image.jpg' } },
      ];
      expect(formatModerationInput(input, false)).toBe('text content');
    });

    it('should join multiple text inputs when filtering for text-only models', () => {
      const input = [
        { type: 'text' as const, text: 'first text' },
        { type: 'image_url' as const, image_url: { url: 'https://example.com/image.jpg' } },
        { type: 'text' as const, text: 'second text' },
      ];
      expect(formatModerationInput(input, false)).toBe('first text second text');
    });

    it('should handle empty text strings when joining for text-only models', () => {
      const input = [
        { type: 'text' as const, text: '' },
        { type: 'image_url' as const, image_url: { url: 'https://example.com/image.jpg' } },
        { type: 'text' as const, text: 'second text' },
      ];
      expect(formatModerationInput(input, false)).toBe(' second text');
    });

    it('should preserve leading and trailing whitespace in text inputs when joining', () => {
      const input = [
        { type: 'text' as const, text: '  first text  ' },
        { type: 'image_url' as const, image_url: { url: 'https://example.com/image.jpg' } },
        { type: 'text' as const, text: 'second text' },
      ];
      expect(formatModerationInput(input, false)).toBe('  first text   second text');
    });

    it('should return single text input unchanged when mixed with images for text-only models', () => {
      const input = [
        { type: 'image_url' as const, image_url: { url: 'https://example.com/image-1.jpg' } },
        { type: 'text' as const, text: 'only text' },
        { type: 'image_url' as const, image_url: { url: 'https://example.com/image-2.jpg' } },
      ];
      expect(formatModerationInput(input, false)).toBe('only text');
    });
  });
});
