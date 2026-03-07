import { describe, expect, it } from 'vitest';
import { handleTrajectoryStepCount } from '../../src/assertions/trajectoryStepCount';

import type { ApiProvider, AssertionParams, AtomicTestCase } from '../../src/types/index';

const mockProvider: ApiProvider = {
  id: () => 'mock',
  callApi: async () => ({ output: 'mock' }),
};

const createParams = (
  output: unknown,
  value: unknown,
  options: { inverse?: boolean } = {},
): AssertionParams => ({
  baseType: 'trajectory:step-count' as const,
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: output as string | object },
  },
  output: output as string | object,
  outputString: typeof output === 'string' ? output : JSON.stringify(output),
  providerResponse: { output: output as string | object },
  test: {} as AtomicTestCase,
  assertion: { type: 'trajectory:step-count', value: value as any },
  renderedValue: value as any,
  inverse: options.inverse ?? false,
});

const openaiOutput = (count: number) => ({
  tool_calls: Array.from({ length: count }, (_, i) => ({
    function: { name: `tool_${i}`, arguments: '{}' },
  })),
});

describe('handleTrajectoryStepCount', () => {
  describe('exact count', () => {
    it('should pass when count matches exactly', () => {
      const output = openaiOutput(3);
      const params = createParams(output, 3);
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(true);
      expect(result.reason).toContain('exactly 3');
    });

    it('should fail when count does not match', () => {
      const output = openaiOutput(5);
      const params = createParams(output, 3);
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(false);
    });
  });

  describe('min/max bounds', () => {
    it('should pass when count is within min-max range', () => {
      const output = openaiOutput(3);
      const params = createParams(output, { min: 1, max: 5 });
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(true);
    });

    it('should pass at min boundary', () => {
      const output = openaiOutput(1);
      const params = createParams(output, { min: 1, max: 5 });
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(true);
    });

    it('should pass at max boundary', () => {
      const output = openaiOutput(5);
      const params = createParams(output, { min: 1, max: 5 });
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(true);
    });

    it('should fail below min', () => {
      const output = openaiOutput(0);
      const params = createParams(output, { min: 1, max: 5 });
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(false);
    });

    it('should fail above max', () => {
      const output = openaiOutput(6);
      const params = createParams(output, { min: 1, max: 5 });
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(false);
    });

    it('should work with only min', () => {
      const output = openaiOutput(10);
      const params = createParams(output, { min: 3 });
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(true);
      expect(result.reason).toContain('at least 3');
    });

    it('should work with only max', () => {
      const output = openaiOutput(2);
      const params = createParams(output, { max: 5 });
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(true);
      expect(result.reason).toContain('at most 5');
    });
  });

  describe('inverse', () => {
    it('should pass inverse when count is outside bounds', () => {
      const output = openaiOutput(10);
      const params = createParams(output, { max: 5 }, { inverse: true });
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(true);
    });

    it('should fail inverse when count is within bounds', () => {
      const output = openaiOutput(3);
      const params = createParams(output, { min: 1, max: 5 }, { inverse: true });
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should count 0 tools for plain text output', () => {
      const output = 'plain text response';
      const params = createParams(output, 0);
      const result = handleTrajectoryStepCount(params);

      expect(result.pass).toBe(true);
    });
  });
});
