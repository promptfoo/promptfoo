import { handleJavascript } from '../../src/assertions/javascript';
import { handlePython } from '../../src/assertions/python';
import { handlePerplexity, handlePerplexityScore } from '../../src/assertions/perplexity';
import type { AssertionParams } from '../../src/types';

describe('Threshold Edge Cases - Truthy vs Undefined', () => {
  const baseParams = {
    baseType: 'javascript' as const,
    context: {},
    cost: 0,
    inverse: false,
    logProbs: [0.1, 0.2, 0.3],
    output: '0',
    outputString: '0',
    prompt: 'test',
    provider: undefined,
    providerResponse: { output: '0' },
    renderedValue: '0',
    test: {},
    valueFromScript: undefined,
  };

  describe('JavaScript assertion threshold handling', () => {
    it('should FAIL when score=0 and no threshold (default behavior)', async () => {
      const params: AssertionParams = {
        ...baseParams,
        assertion: { type: 'javascript', value: 'return 0;' },
        valueFromScript: 0,
      };

      const result = await handleJavascript(params);
      
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should PASS when score=0 and threshold=0 (explicit zero threshold)', async () => {
      const params: AssertionParams = {
        ...baseParams,
        assertion: { type: 'javascript', value: 'return 0;', threshold: 0 },
        valueFromScript: 0,
      };

      const result = await handleJavascript(params);
      
      expect(result.pass).toBe(true);
      expect(result.score).toBe(0);
    });

    it('should FAIL when score=0 and threshold=0.1', async () => {
      const params: AssertionParams = {
        ...baseParams,
        assertion: { type: 'javascript', value: 'return 0;', threshold: 0.1 },
        valueFromScript: 0,
      };

      const result = await handleJavascript(params);
      
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should PASS when score=1 and threshold=0', async () => {
      const params: AssertionParams = {
        ...baseParams,
        assertion: { type: 'javascript', value: 'return 1;', threshold: 0 },
        valueFromScript: 1,
      };

      const result = await handleJavascript(params);
      
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should PASS when score=1 and no threshold', async () => {
      const params: AssertionParams = {
        ...baseParams,
        assertion: { type: 'javascript', value: 'return 1;' },
        valueFromScript: 1,
      };

      const result = await handleJavascript(params);
      
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });
  });

  describe('Python assertion threshold handling', () => {
    it('should FAIL when score=0 and no threshold', async () => {
      const params: AssertionParams = {
        ...baseParams,
        baseType: 'python' as const,
        assertion: { type: 'python', value: 'return 0' },
        valueFromScript: 0,
      };

      const result = await handlePython(params);
      
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should PASS when score=0 and threshold=0', async () => {
      const params: AssertionParams = {
        ...baseParams,
        baseType: 'python' as const,
        assertion: { type: 'python', value: 'return 0', threshold: 0 },
        valueFromScript: 0,
      };

      const result = await handlePython(params);
      
      expect(result.pass).toBe(true);
      expect(result.score).toBe(0);
    });

    it('should FAIL when score=0 and threshold=0.1', async () => {
      const params: AssertionParams = {
        ...baseParams,
        baseType: 'python' as const,
        assertion: { type: 'python', value: 'return 0', threshold: 0.1 },
        valueFromScript: 0,
      };

      const result = await handlePython(params);
      
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('Perplexity assertion threshold handling', () => {
    it('should PASS when no threshold is specified (default behavior)', () => {
      const params: AssertionParams = {
        ...baseParams,
        baseType: 'perplexity' as const,
        assertion: { type: 'perplexity' },
        logProbs: [0.1, 0.2, 0.3],
      };

      const result = handlePerplexity(params);
      
      expect(result.pass).toBe(true); // No threshold = always pass
    });

    it('should respect threshold=0 as a valid threshold', () => {
      const params: AssertionParams = {
        ...baseParams,
        baseType: 'perplexity' as const,
        assertion: { type: 'perplexity', threshold: 0 },
        logProbs: [0.1, 0.2, 0.3],
      };

      const result = handlePerplexity(params);
      
      // Perplexity will be > 0, so with threshold=0, should fail
      expect(result.pass).toBe(false);
    });

    it('should PASS when no threshold is specified for perplexity-score', () => {
      const params: AssertionParams = {
        ...baseParams,
        baseType: 'perplexity-score' as const,
        assertion: { type: 'perplexity-score' },
        logProbs: [0.1, 0.2, 0.3],
      };

      const result = handlePerplexityScore(params);
      
      expect(result.pass).toBe(true); // No threshold = always pass
    });

    it('should respect threshold=0 as valid for perplexity-score', () => {
      const params: AssertionParams = {
        ...baseParams,
        baseType: 'perplexity-score' as const,
        assertion: { type: 'perplexity-score', threshold: 0 },
        logProbs: [0.1, 0.2, 0.3],
      };

      const result = handlePerplexityScore(params);
      
      // Perplexity score will be > 0, so should pass with threshold=0
      expect(result.pass).toBe(true);
    });
  });

  describe('Edge cases with different falsy values', () => {
    it('should handle threshold=0 differently from threshold=undefined', async () => {
      const paramsWithoutThreshold: AssertionParams = {
        ...baseParams,
        assertion: { type: 'javascript', value: 'return 0;' },
        valueFromScript: 0,
      };

      const paramsWithZeroThreshold: AssertionParams = {
        ...baseParams,
        assertion: { type: 'javascript', value: 'return 0;', threshold: 0 },
        valueFromScript: 0,
      };

      const resultWithoutThreshold = await handleJavascript(paramsWithoutThreshold);
      const resultWithZeroThreshold = await handleJavascript(paramsWithZeroThreshold);
      
      // These should have different outcomes
      expect(resultWithoutThreshold.pass).toBe(false);  // score > 0 check
      expect(resultWithZeroThreshold.pass).toBe(true);   // score >= 0 check
      
      // But same score
      expect(resultWithoutThreshold.score).toBe(0);
      expect(resultWithZeroThreshold.score).toBe(0);
    });

    it('should handle various falsy threshold values correctly', async () => {
      const testCases = [
        { threshold: 0, expected: true, description: 'threshold=0' },
        { threshold: undefined, expected: false, description: 'threshold=undefined' },
        // Note: null, empty string, false are treated as valid thresholds and compared numerically
        // null becomes 0 when compared: 0 >= null (which is 0) = true  
        { threshold: null, expected: true, description: 'threshold=null (becomes 0)' },
        // Empty string becomes 0 when compared: 0 >= '' (which is 0) = true
        { threshold: '', expected: true, description: 'threshold="" (becomes 0)' },
        // false becomes 0 when compared: 0 >= false (which is 0) = true
        { threshold: false, expected: true, description: 'threshold=false (becomes 0)' },
      ];

      for (const testCase of testCases) {
        const params: AssertionParams = {
          ...baseParams,
          assertion: { 
            type: 'javascript', 
            value: 'return 0;', 
            threshold: testCase.threshold as any
          },
          valueFromScript: 0,
        };

        const result = await handleJavascript(params);
        
        expect(result.pass).toBe(testCase.expected);
        expect(result.score).toBe(0);
      }
    });
  });
});