import { handleCost } from '../../src/assertions/cost';
import { handleLatency } from '../../src/assertions/latency';
import type { AssertionParams } from '../../src/types';

describe('Cost and Latency Assertion Threshold Edge Cases', () => {
  const baseCostParams = {
    baseType: 'cost' as const,
    context: {},
    cost: 0,
    inverse: false,
    output: 'test',
    outputString: 'test',
    prompt: 'test',
    provider: undefined,
    providerResponse: { output: 'test' },
    renderedValue: 'test',
    test: {},
    valueFromScript: undefined,
  };

  const baseLatencyParams = {
    baseType: 'latency' as const,
    context: {},
    cost: 0,
    inverse: false,
    latencyMs: 0,
    output: 'test',
    outputString: 'test',
    prompt: 'test',
    provider: undefined,
    providerResponse: { output: 'test' },
    renderedValue: 'test',
    test: {},
    valueFromScript: undefined,
  };

  describe('Cost assertion threshold handling', () => {
    it('should throw error when threshold is undefined', () => {
      const params: AssertionParams = {
        ...baseCostParams,
        assertion: { type: 'cost' },
      };

      expect(() => handleCost(params)).toThrow('Cost assertion must have a threshold');
    });

    it('should NOT throw error when threshold is 0', () => {
      const params: AssertionParams = {
        ...baseCostParams,
        assertion: { type: 'cost', threshold: 0 },
        cost: 0,
      };

      expect(() => handleCost(params)).not.toThrow();
      const result = handleCost(params);
      expect(result.pass).toBe(true); // 0 <= 0
    });

    it('should fail when cost exceeds threshold=0', () => {
      const params: AssertionParams = {
        ...baseCostParams,
        assertion: { type: 'cost', threshold: 0 },
        cost: 0.01,
      };

      const result = handleCost(params);
      expect(result.pass).toBe(false); // 0.01 > 0
      expect(result.score).toBe(0);
    });

    it('should pass when cost equals threshold=0', () => {
      const params: AssertionParams = {
        ...baseCostParams,
        assertion: { type: 'cost', threshold: 0 },
        cost: 0,
      };

      const result = handleCost(params);
      expect(result.pass).toBe(true); // 0 <= 0
      expect(result.score).toBe(1);
    });

    it('should handle various falsy threshold values', () => {
      const testCases = [
        { threshold: 0, cost: 0, expected: true, description: 'threshold=0, cost=0' },
        { threshold: 0, cost: 0.01, expected: false, description: 'threshold=0, cost=0.01' },
        // null, empty string, false are converted to 0 in comparison
        { threshold: null as any, cost: 0, expected: true, description: 'threshold=null, cost=0' },
        { threshold: false as any, cost: 0, expected: true, description: 'threshold=false, cost=0' },
      ];

      for (const testCase of testCases) {
        const params: AssertionParams = {
          ...baseCostParams,
          assertion: { type: 'cost', threshold: testCase.threshold },
          cost: testCase.cost,
        };

        const result = handleCost(params);
        expect(result.pass).toBe(testCase.expected);
      }
    });
  });

  describe('Latency assertion threshold handling', () => {
    it('should throw error when threshold is undefined', () => {
      const params: AssertionParams = {
        ...baseLatencyParams,
        assertion: { type: 'latency' },
      };

      expect(() => handleLatency(params)).toThrow('Latency assertion must have a threshold in milliseconds');
    });

    it('should NOT throw error when threshold is 0', () => {
      const params: AssertionParams = {
        ...baseLatencyParams,
        assertion: { type: 'latency', threshold: 0 },
        latencyMs: 0,
      };

      expect(() => handleLatency(params)).not.toThrow();
      const result = handleLatency(params);
      expect(result.pass).toBe(true); // 0 <= 0
    });

    it('should fail when latency exceeds threshold=0', () => {
      const params: AssertionParams = {
        ...baseLatencyParams,
        assertion: { type: 'latency', threshold: 0 },
        latencyMs: 1,
      };

      const result = handleLatency(params);
      expect(result.pass).toBe(false); // 1 > 0
      expect(result.score).toBe(0);
    });

    it('should pass when latency equals threshold=0', () => {
      const params: AssertionParams = {
        ...baseLatencyParams,
        assertion: { type: 'latency', threshold: 0 },
        latencyMs: 0,
      };

      const result = handleLatency(params);
      expect(result.pass).toBe(true); // 0 <= 0
      expect(result.score).toBe(1);
    });

    it('should handle various falsy threshold values', () => {
      const testCases = [
        { threshold: 0, latency: 0, expected: true, description: 'threshold=0, latency=0' },
        { threshold: 0, latency: 1, expected: false, description: 'threshold=0, latency=1' },
        // null, empty string, false are converted to 0 in comparison
        { threshold: null as any, latency: 0, expected: true, description: 'threshold=null, latency=0' },
        { threshold: false as any, latency: 0, expected: true, description: 'threshold=false, latency=0' },
      ];

      for (const testCase of testCases) {
        const params: AssertionParams = {
          ...baseLatencyParams,
          assertion: { type: 'latency', threshold: testCase.threshold },
          latencyMs: testCase.latency,
        };

        const result = handleLatency(params);
        expect(result.pass).toBe(testCase.expected);
      }
    });

    it('should throw error when latencyMs is undefined', () => {
      const params: AssertionParams = {
        ...baseLatencyParams,
        assertion: { type: 'latency', threshold: 100 },
        latencyMs: undefined,
      };

      expect(() => handleLatency(params)).toThrow(
        'Latency assertion does not support cached results. Rerun the eval with --no-cache'
      );
    });
  });
});