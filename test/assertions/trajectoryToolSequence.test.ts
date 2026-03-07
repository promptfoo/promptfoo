import { describe, expect, it } from 'vitest';
import { handleTrajectoryToolSequence } from '../../src/assertions/trajectoryToolSequence';

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
  baseType: 'trajectory:tool-sequence' as const,
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
  assertion: { type: 'trajectory:tool-sequence', value: value as any },
  renderedValue: value as any,
  inverse: options.inverse ?? false,
});

const openaiOutput = (toolNames: string[]) => ({
  tool_calls: toolNames.map((name) => ({ function: { name, arguments: '{}' } })),
});

describe('handleTrajectoryToolSequence', () => {
  describe('exact mode (default)', () => {
    it('should pass when sequence matches exactly', () => {
      const output = openaiOutput(['search', 'compose', 'send']);
      const params = createParams(output, ['search', 'compose', 'send']);
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(true);
      expect(result.reason).toContain('matches exactly');
    });

    it('should fail when sequence differs in order', () => {
      const output = openaiOutput(['compose', 'search', 'send']);
      const params = createParams(output, ['search', 'compose', 'send']);
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(false);
    });

    it('should fail when sequence has extra tools', () => {
      const output = openaiOutput(['search', 'log', 'compose', 'send']);
      const params = createParams(output, ['search', 'compose', 'send']);
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(false);
    });

    it('should fail when sequence is missing tools', () => {
      const output = openaiOutput(['search', 'send']);
      const params = createParams(output, ['search', 'compose', 'send']);
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(false);
    });
  });

  describe('in_order mode', () => {
    it('should pass when tools appear in order with other tools between', () => {
      const output = openaiOutput(['init', 'search', 'log', 'compose', 'validate', 'send']);
      const params = createParams(output, {
        sequence: ['search', 'compose', 'send'],
        mode: 'in_order',
      });
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(true);
      expect(result.reason).toContain('appeared in order');
    });

    it('should fail when tools are out of order', () => {
      const output = openaiOutput(['send', 'search', 'compose']);
      const params = createParams(output, {
        sequence: ['search', 'compose', 'send'],
        mode: 'in_order',
      });
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(false);
    });

    it('should fail when expected tool is missing', () => {
      const output = openaiOutput(['search', 'send']);
      const params = createParams(output, {
        sequence: ['search', 'compose', 'send'],
        mode: 'in_order',
      });
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(false);
    });
  });

  describe('any_order mode', () => {
    it('should pass when all tools present regardless of order', () => {
      const output = openaiOutput(['send', 'compose', 'search']);
      const params = createParams(output, {
        sequence: ['search', 'compose', 'send'],
        mode: 'any_order',
      });
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(true);
    });

    it('should fail when tool is missing', () => {
      const output = openaiOutput(['search', 'send']);
      const params = createParams(output, {
        sequence: ['search', 'compose', 'send'],
        mode: 'any_order',
      });
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(false);
      expect(result.reason).toContain('compose');
    });
  });

  describe('inverse', () => {
    it('should pass inverse when sequence does NOT match', () => {
      const output = openaiOutput(['compose', 'search']);
      const params = createParams(output, ['search', 'compose'], { inverse: true });
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(true);
    });

    it('should fail inverse when sequence matches', () => {
      const output = openaiOutput(['search', 'compose']);
      const params = createParams(output, ['search', 'compose'], { inverse: true });
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty tool calls', () => {
      const output = 'plain text';
      const params = createParams(output, ['search']);
      const result = handleTrajectoryToolSequence(params);

      expect(result.pass).toBe(false);
      expect(result.reason).toContain('(none)');
    });
  });
});
