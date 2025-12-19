import { describe, expect, it } from 'vitest';
import {
  AZURE_MAX_SEVERITY,
  type AzureModerationCategory,
  getModerationCacheKey,
  handleApiError,
  parseAzureModerationResponse,
} from '../../../src/providers/azure/moderation';

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

      expect(result.flags).toHaveLength(1);
      expect(result.flags![0].code).toBe('hate');
      expect(result.flags![0].description).toBe('Content flagged for Hate');
      expect(result.flags![0].confidence).toBeCloseTo(4 / AZURE_MAX_SEVERITY);
      expect(result.flags![0].metadata).toEqual({
        azure_severity: 4,
        max_severity: AZURE_MAX_SEVERITY,
      });
    });

    it('should return all categories when returnAllCategories is true', () => {
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

      const result = parseAzureModerationResponse(response, { returnAllCategories: true });

      expect(result.flags).toHaveLength(2);
      expect(result.flags![0].code).toBe('hate');
      expect(result.flags![0].description).toBe('Content flagged for Hate');
      expect(result.flags![1].code).toBe('sexual');
      expect(result.flags![1].description).toBe('Sexual (not flagged)');
      expect(result.flags![1].confidence).toBe(0);
    });

    it('should use custom maxSeverity for confidence calculation', () => {
      const response = {
        categoriesAnalysis: [
          {
            category: 'Hate' as AzureModerationCategory,
            severity: 2,
          },
        ],
      };

      // Use maxSeverity of 3 (FourSeverityLevels for images)
      const result = parseAzureModerationResponse(response, { maxSeverity: 3 });

      expect(result.flags).toHaveLength(1);
      expect(result.flags![0].confidence).toBeCloseTo(2 / 3);
      expect(result.flags![0].metadata).toEqual({
        azure_severity: 2,
        max_severity: 3,
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

      expect(result.flags).toHaveLength(2);
      expect(result.flags![0]).toEqual({
        code: 'hate',
        description: 'Content flagged for Hate',
        confidence: 3 / AZURE_MAX_SEVERITY,
        metadata: { azure_severity: 3, max_severity: AZURE_MAX_SEVERITY },
      });
      expect(result.flags![1]).toEqual({
        code: 'violence',
        description: 'Content flagged for Violence',
        confidence: 5 / AZURE_MAX_SEVERITY,
        metadata: { azure_severity: 5, max_severity: AZURE_MAX_SEVERITY },
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

      expect(result.flags).toHaveLength(2);
      expect(result.flags![0]).toEqual({
        code: 'hate',
        description: 'Content flagged for Hate',
        confidence: 5 / AZURE_MAX_SEVERITY,
        metadata: { azure_severity: 5, max_severity: AZURE_MAX_SEVERITY },
      });
      expect(result.flags![1]).toEqual({
        code: 'blocklist:custom-list',
        description: 'Content matched blocklist item: forbidden term',
        confidence: 1.0,
        metadata: {
          blocklist_item_id: '456',
          blocklist_item_text: 'forbidden term',
        },
      });
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

      expect(key).toBe('azure-moderation:test-model:"test content"');
    });

    it('should handle empty content', () => {
      const key = getModerationCacheKey('model', {}, '');
      expect(key).toBe('azure-moderation:model:""');
    });

    it('should handle complex config object', () => {
      const config = {
        apiKey: 'key',
        endpoint: 'https://test.com',
        headers: { 'X-Test': 'value' },
      };

      const key = getModerationCacheKey('model', config, 'content');
      expect(key).toBe('azure-moderation:model:"content"');
    });
  });
});
