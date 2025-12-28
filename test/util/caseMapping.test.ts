import { describe, expect, it } from 'vitest';
import { mapSnakeCaseToCamelCase } from '../../src/util/caseMapping';

describe('caseMapping utilities', () => {
  describe('mapSnakeCaseToCamelCase', () => {
    it('should map pass_ to pass', () => {
      const result = mapSnakeCaseToCamelCase({ pass_: true, reason: 'test' });
      expect(result.pass).toBe(true);
      expect(result.pass_).toBe(true); // Original key preserved
    });

    it('should not override existing pass key', () => {
      const result = mapSnakeCaseToCamelCase({ pass: false, pass_: true });
      expect(result.pass).toBe(false);
    });

    it('should map named_scores to namedScores', () => {
      const result = mapSnakeCaseToCamelCase({
        named_scores: { accuracy: 0.9 },
      });
      expect(result.namedScores).toEqual({ accuracy: 0.9 });
    });

    it('should not override existing namedScores key', () => {
      const result = mapSnakeCaseToCamelCase({
        namedScores: { accuracy: 0.8 },
        named_scores: { accuracy: 0.9 },
      });
      expect(result.namedScores).toEqual({ accuracy: 0.8 });
    });

    it('should map component_results to componentResults', () => {
      const result = mapSnakeCaseToCamelCase({
        component_results: [{ pass: true }],
      });
      expect(result.componentResults).toEqual([{ pass: true }]);
    });

    it('should map tokens_used to tokensUsed', () => {
      const result = mapSnakeCaseToCamelCase({
        tokens_used: { total: 100 },
      });
      expect(result.tokensUsed).toEqual({ total: 100 });
    });

    it('should recursively map nested component results', () => {
      const result = mapSnakeCaseToCamelCase({
        component_results: [
          { pass_: true, named_scores: { score1: 0.5 } },
          { pass_: false, named_scores: { score2: 0.3 } },
        ],
      });
      expect(result.componentResults).toHaveLength(2);
      expect(result.componentResults[0].pass).toBe(true);
      expect(result.componentResults[0].namedScores).toEqual({ score1: 0.5 });
      expect(result.componentResults[1].pass).toBe(false);
      expect(result.componentResults[1].namedScores).toEqual({ score2: 0.3 });
    });

    it('should handle deeply nested component results', () => {
      const result = mapSnakeCaseToCamelCase({
        component_results: [
          {
            pass_: true,
            component_results: [{ pass_: false, named_scores: { inner: 1 } }],
          },
        ],
      });
      expect(result.componentResults[0].pass).toBe(true);
      expect(result.componentResults[0].componentResults[0].pass).toBe(false);
      expect(result.componentResults[0].componentResults[0].namedScores).toEqual({ inner: 1 });
    });

    it('should handle non-object items in componentResults array', () => {
      const result = mapSnakeCaseToCamelCase({
        component_results: [null, undefined, 'string', 123, { pass_: true }],
      });
      expect(result.componentResults).toEqual([
        null,
        undefined,
        'string',
        123,
        { pass_: true, pass: true },
      ]);
    });

    it('should not mutate the original object', () => {
      const original = { pass_: true, named_scores: { a: 1 } };
      const originalCopy = JSON.parse(JSON.stringify(original));
      mapSnakeCaseToCamelCase(original);
      expect(original).toEqual(originalCopy);
    });

    it('should handle empty object', () => {
      const result = mapSnakeCaseToCamelCase({});
      expect(result).toEqual({});
    });

    it('should preserve other keys unchanged', () => {
      const result = mapSnakeCaseToCamelCase({
        pass_: true,
        reason: 'test reason',
        score: 0.95,
        customField: 'value',
      });
      expect(result.reason).toBe('test reason');
      expect(result.score).toBe(0.95);
      expect(result.customField).toBe('value');
    });

    it('should handle all mappings together', () => {
      const result = mapSnakeCaseToCamelCase({
        pass_: true,
        named_scores: { accuracy: 0.9 },
        component_results: [{ pass_: false }],
        tokens_used: { total: 50 },
      });
      expect(result.pass).toBe(true);
      expect(result.namedScores).toEqual({ accuracy: 0.9 });
      expect(result.componentResults[0].pass).toBe(false);
      expect(result.tokensUsed).toEqual({ total: 50 });
    });
  });
});
