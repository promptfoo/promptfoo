import { describe, expect, it } from 'vitest';
import {
  analyzeVariableCoverage,
  identifyGaps,
  measureDiversity,
  suggestDiversityImprovements,
} from '../../../src/generation/dataset/diversityMeasurement';

import type { ApiProvider } from '../../../src/types';

describe('diversityMeasurement', () => {
  describe('measureDiversity', () => {
    it('should measure diversity of test cases', async () => {
      const testCases = [
        { name: 'Alice', query: 'How do I reset my password?' },
        { name: 'Bob', query: 'What are your business hours?' },
        { name: 'Charlie', query: 'Can I cancel my subscription?' },
      ];

      const result = await measureDiversity(testCases);

      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.averageDistance).toBeDefined();
      expect(result.minDistance).toBeDefined();
      expect(result.maxDistance).toBeDefined();
    });

    it('should return low diversity for identical test cases', async () => {
      const testCases = [
        { name: 'Alice', query: 'Hello' },
        { name: 'Alice', query: 'Hello' },
        { name: 'Alice', query: 'Hello' },
      ];

      const result = await measureDiversity(testCases);

      // Identical test cases should have 0 distance (0 diversity)
      expect(result.score).toBeLessThanOrEqual(0.1);
    });

    it('should return high diversity for very different test cases', async () => {
      const testCases = [
        { name: 'Alice', query: 'Technical support question about programming' },
        { name: 'Bob', query: 'Billing and payment inquiry for subscription' },
        { name: 'Charlie', query: 'General feedback about product quality' },
        { name: 'Diana', query: 'Account security and authentication issue' },
      ];

      const result = await measureDiversity(testCases);

      expect(result.score).toBeGreaterThan(0.3);
    });

    it('should handle empty test cases array', async () => {
      const testCases: Record<string, string>[] = [];

      const result = await measureDiversity(testCases);

      // Empty array returns score: 0
      expect(result.score).toBe(0);
      expect(result.averageDistance).toBe(0);
    });

    it('should handle single test case', async () => {
      const testCases = [{ name: 'Alice', query: 'Hello world' }];

      const result = await measureDiversity(testCases);

      // Single test case returns score: 1 (perfect diversity by definition, no comparison to make)
      expect(result.score).toBe(1);
      expect(result.averageDistance).toBe(0);
    });

    it('should use embeddings when an embedding-capable provider is supplied', async () => {
      const provider = {
        id: () => 'embedding-provider',
        callApi: async () => ({ output: '' }),
        callEmbeddingApi: async (input: string) => ({
          embedding: input.includes('billing') ? [1, 0] : [0, 1],
        }),
      } as unknown as ApiProvider;

      const result = await measureDiversity(
        [{ topic: 'billing' }, { topic: 'support' }],
        provider,
        { measureMethod: 'embedding' },
      );

      expect(result.score).toBe(1);
      expect(result.averageDistance).toBe(1);
      expect(result.minDistance).toBe(1);
      expect(result.maxDistance).toBe(1);
    });

    it('should fall back to text diversity when embedding responses are incomplete', async () => {
      const provider = {
        id: () => 'broken-embedding-provider',
        callApi: async () => ({ output: '' }),
        callEmbeddingApi: async () => ({}),
      } as unknown as ApiProvider;

      const result = await measureDiversity(
        [{ topic: 'billing' }, { topic: 'support' }],
        provider,
        { measureMethod: 'embedding' },
      );

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe('analyzeVariableCoverage', () => {
    it('should calculate per-variable coverage statistics', () => {
      const testCases = [
        { type: 'question', topic: 'billing' },
        { type: 'complaint', topic: 'service' },
        { type: 'feedback', topic: 'product' },
      ];

      const result = analyzeVariableCoverage(testCases);

      expect(result).toBeDefined();
      expect(Object.keys(result)).toContain('type');
      expect(Object.keys(result)).toContain('topic');
      expect(result['type'].uniqueValues).toBe(3);
      expect(result['topic'].uniqueValues).toBe(3);
    });

    it('should handle empty test cases', () => {
      const testCases: Record<string, string>[] = [];

      const result = analyzeVariableCoverage(testCases);

      expect(result).toEqual({});
    });

    it('should calculate coverage ratio correctly', () => {
      const testCases = [
        { category: 'A', value: 'x' },
        { category: 'A', value: 'y' },
        { category: 'B', value: 'z' },
      ];

      const result = analyzeVariableCoverage(testCases);

      // category has 2 unique values out of 3 entries
      expect(result['category'].uniqueValues).toBe(2);
      expect(result['category'].coverage).toBeCloseTo(2 / 3);
      // value has 3 unique values out of 3 entries
      expect(result['value'].uniqueValues).toBe(3);
      expect(result['value'].coverage).toBe(1);
    });
  });

  describe('coverage gap analysis', () => {
    it('should identify topic, entity, format, and low-diversity gaps', async () => {
      const gaps = await identifyGaps(
        [
          { tone: 'formal', topic: 'general' },
          { tone: 'formal', topic: 'general' },
          { tone: 'formal', topic: 'general' },
          { tone: 'formal', topic: 'general' },
        ],
        {
          topics: [{ name: 'billing' }],
          entities: [{ name: 'invoice' }],
          constraints: [{ description: 'Return valid JSON', type: 'format', source: 'explicit' }],
        },
      );

      expect(gaps).toEqual(
        expect.arrayContaining([
          'Topic "billing" may not be covered in test cases',
          'Entity "invoice" is not represented in test cases',
          'Format constraint "Return valid JSON" may need more test cases',
          'Variable "tone" has low diversity (1 unique values)',
        ]),
      );
    });

    it('should report an empty-input gap before deeper analysis', async () => {
      await expect(
        identifyGaps([], {
          topics: [],
          entities: [],
          constraints: [],
        }),
      ).resolves.toEqual(['No test cases generated']);
    });

    it('should suggest targeted improvements based on gaps and constraint types', () => {
      const suggestions = suggestDiversityImprovements(
        [{ topic: 'general' }],
        {
          topics: [{ name: 'billing' }],
          entities: [{ name: 'invoice' }],
          constraints: [
            { description: 'Keep it brief', type: 'length', source: 'explicit' },
            { description: 'Use JSON', type: 'format', source: 'explicit' },
          ],
        },
        [
          'Topic "billing" may not be covered in test cases',
          'Entity "invoice" is not represented in test cases',
          'Variable "tone" has low diversity (1 unique values)',
        ],
      );

      expect(suggestions).toEqual(
        expect.arrayContaining([
          'Add test cases that explicitly address the topic: billing',
          'Add test cases that include the entity: invoice',
          'Increase variety of values for variable: tone',
          'Add test cases with varying input lengths (short, medium, long)',
          'Add test cases with different format variations',
        ]),
      );
    });
  });
});
