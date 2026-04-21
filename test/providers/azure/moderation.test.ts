import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../../src/cache';
import {
  type AzureModerationCategory,
  AzureModerationProvider,
  getModerationCacheKey,
  handleApiError,
  parseAzureModerationResponse,
} from '../../../src/providers/azure/moderation';

vi.mock('../../../src/cache');
vi.mock('../../../src/util/fetch/index');

describe('Azure Moderation', () => {
  describe('parseAzureModerationResponse', () => {
    it('should parse valid response with categories', () => {
      const response = {
        categoriesAnalysis: [
          {
            category: 'Hate' as AzureModerationCategory,
            severity: 4,
          },
          {
            category: 'Sexual' as AzureModerationCategory,
            severity: 0,
          },
        ],
      };

      const result = parseAzureModerationResponse(response);

      expect(result).toEqual({
        flags: [
          {
            code: 'hate',
            description: 'Content flagged for Hate',
            confidence: 4 / 7,
          },
        ],
      });
    });

    it('should handle null/undefined response', () => {
      expect(parseAzureModerationResponse(null as any)).toEqual({ flags: [] });
      expect(parseAzureModerationResponse(undefined as any)).toEqual({ flags: [] });
    });

    it('should handle empty categories', () => {
      const response = {
        categoriesAnalysis: [],
      };

      expect(parseAzureModerationResponse(response)).toEqual({ flags: [] });
    });

    it('should handle multiple categories with severity', () => {
      const response = {
        categoriesAnalysis: [
          {
            category: 'Hate' as AzureModerationCategory,
            severity: 3,
          },
          {
            category: 'Violence' as AzureModerationCategory,
            severity: 5,
          },
          {
            category: 'Sexual' as AzureModerationCategory,
            severity: 0,
          },
        ],
      };

      const result = parseAzureModerationResponse(response);

      expect(result).toEqual({
        flags: [
          {
            code: 'hate',
            description: 'Content flagged for Hate',
            confidence: 3 / 7,
          },
          {
            code: 'violence',
            description: 'Content flagged for Violence',
            confidence: 5 / 7,
          },
        ],
      });
    });

    it('should handle parsing errors', () => {
      const malformedResponse = Object.create(null);
      Object.defineProperty(malformedResponse, 'categoriesAnalysis', {
        get() {
          throw new Error('Invalid access');
        },
      });

      const result = parseAzureModerationResponse(malformedResponse as any);
      expect(result.flags).toEqual([]);
      expect(result.error).toBe('Failed to parse moderation response');
    });

    it('should handle both categories and blocklist matches', () => {
      const response = {
        categoriesAnalysis: [
          {
            category: 'Hate' as AzureModerationCategory,
            severity: 5,
          },
        ],
        blocklistsMatch: [
          {
            blocklistName: 'custom-list',
            blocklistItemId: '456',
            blocklistItemText: 'forbidden term',
          },
        ],
      };

      const result = parseAzureModerationResponse(response);

      expect(result.flags).toEqual([
        {
          code: 'hate',
          description: 'Content flagged for Hate',
          confidence: 5 / 7,
        },
        {
          code: 'blocklist:custom-list',
          description: 'Content matched blocklist item: forbidden term',
          confidence: 1.0,
        },
      ]);
    });
  });

  describe('handleApiError', () => {
    it('should format error with message', () => {
      const error = new Error('API failure');
      const result = handleApiError(error);

      expect(result).toEqual({
        error: 'API failure',
        flags: [],
      });
    });

    it('should handle error without message', () => {
      const result = handleApiError({});

      expect(result).toEqual({
        error: 'Unknown error',
        flags: [],
      });
    });

    it('should include additional data if provided', () => {
      const error = new Error('API error');
      const data = { detail: 'Additional info' };
      const result = handleApiError(error, data);

      expect(result.error).toBe('API error');
      expect(result.flags).toEqual([]);
    });
  });

  describe('getModerationCacheKey', () => {
    it('should generate correct cache key', () => {
      const modelName = 'test-model';
      const config = { apiKey: 'test-key' };
      const content = 'test content';

      const key = getModerationCacheKey(modelName, config, content);

      expect(key).toBe(
        'azure-moderation:test-model:{"blocklistNames":[],"haltOnBlocklistHit":false,"passthrough":{}}:"test content"',
      );
    });

    it('should handle empty content', () => {
      const key = getModerationCacheKey('model', {}, '');
      expect(key).toBe(
        'azure-moderation:model:{"blocklistNames":[],"haltOnBlocklistHit":false,"passthrough":{}}:""',
      );
    });

    it('should include request-shaping config in the cache key', () => {
      const key = getModerationCacheKey(
        'model',
        {
          blocklistNames: ['custom-list'],
          haltOnBlocklistHit: true,
          passthrough: { outputType: 'EightSeverityLevels' },
        },
        'content',
      );

      expect(key).toBe(
        'azure-moderation:model:{"blocklistNames":["custom-list"],"haltOnBlocklistHit":true,"passthrough":{"outputType":"EightSeverityLevels"}}:"content"',
      );
    });

    it('should include endpoint and apiVersion in the cache key', () => {
      const firstKey = getModerationCacheKey(
        'model',
        { endpoint: 'https://resource-a.cognitiveservices.azure.com/' },
        'content',
      );
      const secondKey = getModerationCacheKey(
        'model',
        { endpoint: 'https://resource-b.cognitiveservices.azure.com/' },
        'content',
      );

      expect(firstKey).not.toBe(secondKey);

      const versionKey1 = getModerationCacheKey('model', { apiVersion: '2024-09-01' }, 'content');
      const versionKey2 = getModerationCacheKey(
        'model',
        { apiVersion: '2024-09-15-preview' },
        'content',
      );

      expect(versionKey1).not.toBe(versionKey2);
    });

    it('should ignore apiKey and apiKeyEnvar in the cache key', () => {
      const firstKey = getModerationCacheKey(
        'model',
        { apiKey: 'key-1', apiKeyEnvar: 'MY_KEY_1', endpoint: 'https://test.com' },
        'content',
      );
      const secondKey = getModerationCacheKey(
        'model',
        { apiKey: 'key-2', apiKeyEnvar: 'MY_KEY_2', endpoint: 'https://test.com' },
        'content',
      );

      expect(firstKey).toBe(secondKey);
    });

    it('should differentiate by headers without leaking raw values', () => {
      const firstKey = getModerationCacheKey(
        'model',
        { endpoint: 'https://test.com', headers: { Authorization: 'Bearer secret-token-1' } },
        'content',
      );
      const secondKey = getModerationCacheKey(
        'model',
        { endpoint: 'https://test.com', headers: { Authorization: 'Bearer secret-token-2' } },
        'content',
      );

      expect(firstKey).not.toBe(secondKey);
      expect(firstKey).not.toContain('secret-token-1');
      expect(secondKey).not.toContain('secret-token-2');
      expect(firstKey).toContain('headersHash');
    });

    it('should treat empty headers the same as absent headers', () => {
      const noHeaders = getModerationCacheKey('model', {}, 'content');
      const emptyHeaders = getModerationCacheKey('model', { headers: {} }, 'content');
      const undefinedHeaders = getModerationCacheKey('model', { headers: undefined }, 'content');

      expect(noHeaders).toBe(emptyHeaders);
      expect(noHeaders).toBe(undefinedHeaders);
    });

    it('should produce the same hash regardless of header key order', () => {
      const key1 = getModerationCacheKey('model', { headers: { A: '1', B: '2' } }, 'content');
      const key2 = getModerationCacheKey('model', { headers: { B: '2', A: '1' } }, 'content');

      expect(key1).toBe(key2);
    });
  });

  describe('AzureModerationProvider', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(isCacheEnabled).mockReturnValue(false);
    });

    it('should set cached flag when returning cached response', async () => {
      const mockCachedResponse = {
        flags: [
          {
            code: 'hate',
            description: 'Content flagged for Hate',
            confidence: 0.8,
          },
        ],
      };

      const mockCache = {
        get: vi.fn().mockResolvedValue(mockCachedResponse),
        set: vi.fn(),
      } as any;

      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockResolvedValue(mockCache);

      const provider = new AzureModerationProvider('text-content-safety', {
        config: {
          apiKey: 'test-key',
          endpoint: 'https://test.cognitiveservices.azure.com/',
        },
      });

      const result = await provider.callModerationApi('user prompt', 'assistant response');

      expect(result.cached).toBe(true);
      expect(result.flags).toEqual(mockCachedResponse.flags);
      expect(mockCache.get).toHaveBeenCalled();
    });

    it('should use resolved endpoint and apiVersion in cache key', async () => {
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      } as any;

      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockResolvedValue(mockCache);

      const { fetchWithProxy } = await import('../../../src/util/fetch/index');
      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: true,
        json: async () => ({ categoriesAnalysis: [] }),
      } as any);

      const provider = new AzureModerationProvider('text-content-safety', {
        config: {
          apiKey: 'test-key',
          endpoint: 'https://resolved-endpoint.cognitiveservices.azure.com/',
          apiVersion: '2024-09-15-preview',
        },
      });

      await provider.callModerationApi('user prompt', 'test content');

      const cacheKey = mockCache.get.mock.calls[0][0] as string;
      expect(cacheKey).toContain('resolved-endpoint');
      expect(cacheKey).toContain('2024-09-15-preview');
    });
  });
});
