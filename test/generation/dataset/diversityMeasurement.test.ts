import { describe, expect, it } from 'vitest';
import {
  analyzeVariableCoverage,
  measureDiversity,
} from '../../../src/generation/dataset/diversityMeasurement';

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
});
