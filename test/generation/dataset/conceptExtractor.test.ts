import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractConcepts } from '../../../src/generation/dataset/conceptExtractor';

import type { ApiProvider } from '../../../src/types';

vi.mock('../../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    level: 'info',
    child: vi.fn().mockReturnValue({}),
  },
}));

describe('conceptExtractor', () => {
  let mockProvider: ApiProvider;
  let mockCallApi: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockCallApi = vi.fn();
    mockProvider = {
      id: () => 'mock-provider',
      callApi: mockCallApi,
    } as unknown as ApiProvider;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('extractConcepts', () => {
    it('should extract concepts from prompts', async () => {
      const mockResponse = {
        output: JSON.stringify({
          topics: [
            { name: 'Customer Service', relevance: 0.9, description: 'Support interactions' },
          ],
          entities: [{ name: 'User', type: 'person', frequency: 'high' }],
          constraints: [{ description: 'Must be polite', source: 'explicit' }],
          variableRelationships: [{ variables: ['name', 'email'], relationship: 'User identity' }],
        }),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const prompts = ['Hello {{name}}, how can I help you?'];
      const result = await extractConcepts(prompts, mockProvider);

      expect(result).toBeDefined();
      expect(result.topics).toHaveLength(1);
      expect(result.topics[0].name).toBe('Customer Service');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('User');
      expect(mockCallApi).toHaveBeenCalled();
    });

    it('should throw error for empty prompts array', async () => {
      const prompts: string[] = [];
      await expect(extractConcepts(prompts, mockProvider)).rejects.toThrow(
        'At least one prompt is required for concept extraction',
      );
      expect(mockCallApi).not.toHaveBeenCalled();
    });

    it('should respect maxTopics and maxEntities options', async () => {
      const mockResponse = {
        output: JSON.stringify({
          topics: [
            { name: 'Topic1', relevance: 0.9 },
            { name: 'Topic2', relevance: 0.8 },
            { name: 'Topic3', relevance: 0.7 },
          ],
          entities: [
            { name: 'Entity1', type: 'person' },
            { name: 'Entity2', type: 'place' },
            { name: 'Entity3', type: 'thing' },
          ],
          constraints: [],
          variableRelationships: [],
        }),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const prompts = ['Test prompt'];
      const result = await extractConcepts(prompts, mockProvider, {
        maxTopics: 2,
        maxEntities: 2,
      });

      expect(result.topics).toHaveLength(2);
      expect(result.entities).toHaveLength(2);
    });

    it('should handle provider errors gracefully', async () => {
      mockCallApi.mockRejectedValue(new Error('API error'));

      const prompts = ['Test prompt'];
      await expect(extractConcepts(prompts, mockProvider)).rejects.toThrow('API error');
    });

    it('should throw error for malformed JSON response', async () => {
      const mockResponse = {
        output: 'not valid json',
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const prompts = ['Test prompt'];
      await expect(extractConcepts(prompts, mockProvider)).rejects.toThrow(
        'Expected at least one JSON object',
      );
    });

    it('should handle partial response data', async () => {
      const mockResponse = {
        output: JSON.stringify({
          topics: [{ name: 'Topic1', relevance: 0.9 }],
          // Missing entities, constraints, variableRelationships
        }),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const prompts = ['Test prompt'];
      const result = await extractConcepts(prompts, mockProvider);

      expect(result.topics).toHaveLength(1);
      expect(result.entities).toEqual([]);
      expect(result.constraints).toEqual([]);
      expect(result.variableRelationships).toEqual([]);
    });
  });
});
