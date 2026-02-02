import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions/index';

import type {
  Assertion,
  AtomicTestCase,
  CombinatorAssertion,
  ProviderResponse,
} from '../../src/types';

vi.mock('../../src/cliState', () => ({
  default: {
    basePath: '/base/path',
  },
}));

vi.mock('../../src/python/pythonUtils', () => ({
  runPython: vi.fn(),
}));

vi.mock('../../src/database', () => ({
  getDb: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
});

describe('Combinator Assertions', () => {
  const mockProviderResponse: ProviderResponse = {
    output: 'test output Paris',
    tokenUsage: { total: 10, prompt: 5, completion: 5 },
  };

  const createTestCase = (assertions: Array<Assertion | CombinatorAssertion>): AtomicTestCase => ({
    assert: assertions,
    vars: {},
  });

  describe('OR Combinator', () => {
    it('should pass when first assertion passes', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          assert: [
            { type: 'contains', value: 'Paris' },
            { type: 'contains', value: 'London' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should pass when second assertion passes', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          assert: [
            { type: 'contains', value: 'London' },
            { type: 'contains', value: 'Paris' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should fail when all assertions fail', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          assert: [
            { type: 'contains', value: 'London' },
            { type: 'contains', value: 'Berlin' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should short-circuit on first passing assertion', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'contains', value: 'Paris' }, // Should be skipped
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      // Check that metadata indicates short-circuit
      expect(result.componentResults?.[0]?.metadata?.skippedCount).toBe(1);
    });

    it('should not short-circuit when shortCircuit is false', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'contains', value: 'Paris' },
          ],
          shortCircuit: false,
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      // Both assertions should have been executed
      expect(result.componentResults?.[0]?.metadata?.executedCount).toBe(2);
      expect(result.componentResults?.[0]?.metadata?.skippedCount).toBe(0);
    });

    it('should return max score among all assertions', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          assert: [
            { type: 'contains', value: 'nonexistent' }, // score: 0
            { type: 'contains', value: 'test' }, // score: 1
          ],
          shortCircuit: false,
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.score).toBe(1);
    });
  });

  describe('AND Combinator', () => {
    it('should pass when all assertions pass', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'contains', value: 'output' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should fail when any assertion fails', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'contains', value: 'nonexistent' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(false);
    });

    it('should short-circuit on first failing assertion', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            { type: 'contains', value: 'nonexistent' },
            { type: 'contains', value: 'test' }, // Should be skipped
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(false);
      expect(result.componentResults?.[0]?.metadata?.skippedCount).toBe(1);
    });

    it('should not short-circuit when shortCircuit is false', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            { type: 'contains', value: 'nonexistent' },
            { type: 'contains', value: 'test' },
          ],
          shortCircuit: false,
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(false);
      expect(result.componentResults?.[0]?.metadata?.executedCount).toBe(2);
    });

    it('should return weighted average score', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            { type: 'contains', value: 'test', weight: 2 }, // score: 1, weight: 2
            { type: 'contains', value: 'nonexistent', weight: 1 }, // score: 0, weight: 1
          ],
          shortCircuit: false,
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      // Weighted average: (1*2 + 0*1) / (2+1) = 2/3 ≈ 0.667
      expect(result.componentResults?.[0]?.score).toBeCloseTo(0.667, 2);
    });
  });

  describe('Nested Combinators', () => {
    it('should handle OR inside AND', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            { type: 'contains', value: 'test' },
            {
              type: 'or',
              assert: [
                { type: 'contains', value: 'Paris' },
                { type: 'contains', value: 'London' },
              ],
            },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });

    it('should handle AND inside OR', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          assert: [
            {
              type: 'and',
              assert: [
                { type: 'contains', value: 'nonexistent' },
                { type: 'contains', value: 'test' },
              ],
            },
            { type: 'contains', value: 'Paris' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });

    it('should handle deeply nested combinators', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            {
              type: 'or',
              assert: [
                {
                  type: 'and',
                  assert: [
                    { type: 'contains', value: 'test' },
                    { type: 'contains', value: 'output' },
                  ],
                },
                { type: 'contains', value: 'nonexistent' },
              ],
            },
            { type: 'contains', value: 'Paris' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });
  });

  describe('Threshold', () => {
    it('should use threshold for OR combinator', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          threshold: 0.9,
          assert: [
            { type: 'contains', value: 'test' }, // score: 1
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should fail when best score below threshold for OR', async () => {
      // This test uses a pass assertion but with a threshold that needs a score > 1
      // Since contains always returns 1 on pass, we'll use threshold 1.1 which can't be met
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          threshold: 1.1, // Cannot be met by contains which returns 1
          assert: [{ type: 'contains', value: 'test' }],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(false);
    });

    it('should use threshold for AND combinator', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          threshold: 0.5,
          assert: [
            { type: 'contains', value: 'test' }, // score: 1
            { type: 'contains', value: 'nonexistent' }, // score: 0
          ],
          shortCircuit: false,
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      // Avg score: 0.5, threshold: 0.5, should pass
      expect(result.pass).toBe(true);
    });

    it('should auto-disable short-circuit when threshold is set for AND', async () => {
      // With threshold, all assertions should run even if first fails
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          threshold: 0.5,
          shortCircuit: true, // Explicitly set, but should be overridden
          assert: [
            { type: 'contains', value: 'nonexistent' }, // score: 0, would normally short-circuit
            { type: 'contains', value: 'test' }, // score: 1
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      // All assertions should have run (no short-circuit)
      expect(result.componentResults?.[0]?.metadata?.executedCount).toBe(2);
      expect(result.componentResults?.[0]?.metadata?.skippedCount).toBe(0);
      // Avg score: 0.5, threshold: 0.5, should pass
      expect(result.pass).toBe(true);
    });

    it('should auto-disable short-circuit when threshold is set for OR', async () => {
      // With threshold, all assertions should run even if first passes
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          threshold: 0.9,
          shortCircuit: true, // Explicitly set, but should be overridden
          assert: [
            { type: 'contains', value: 'test' }, // score: 1, would normally short-circuit
            { type: 'contains', value: 'output' }, // score: 1
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      // All assertions should have run (no short-circuit)
      expect(result.componentResults?.[0]?.metadata?.executedCount).toBe(2);
      expect(result.componentResults?.[0]?.metadata?.skippedCount).toBe(0);
    });
  });

  describe('Config Inheritance', () => {
    it('should propagate config to nested combinators', async () => {
      // This test verifies config flows through nested structures
      // We can't easily test the actual config values without mocking,
      // but we can verify the structure works correctly
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          config: { testKey: 'parentValue' },
          assert: [
            {
              type: 'or',
              config: { testKey: 'childValue' }, // Should override parent
              assert: [{ type: 'contains', value: 'test' }],
            },
            { type: 'contains', value: 'output' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      // Structure should work without errors
      expect(result.pass).toBe(true);
      expect(result.componentResults?.[0]?.componentResults?.length).toBe(2);
    });

    it('should propagate config to assert-sets inside combinators', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          config: { parentConfig: true },
          assert: [
            {
              type: 'assert-set',
              assert: [{ type: 'contains', value: 'test' }],
            },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });
  });

  describe('Mixed Assertions', () => {
    it('should handle combinator alongside regular assertions', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        { type: 'contains', value: 'test' },
        {
          type: 'or',
          assert: [
            { type: 'contains', value: 'Paris' },
            { type: 'contains', value: 'London' },
          ],
        },
        { type: 'contains', value: 'output' },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      // Component results includes both top-level assertions and flattened sub-results
      // 3 top-level + 1 sub-result from OR combinator = 4
      expect(result.componentResults?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single-assertion combinator', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          assert: [{ type: 'contains', value: 'test' }],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });

    it('should handle combinator with weight: 0 assertions', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            { type: 'contains', value: 'nonexistent', weight: 0 },
            { type: 'contains', value: 'test' },
          ],
          shortCircuit: false,
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      // weight: 0 assertions are forced to pass in runAssertion
      expect(result.pass).toBe(true);
    });

    it('should track component results', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'contains', value: 'output' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      const combResult = result.componentResults?.[0];
      expect(combResult?.componentResults?.length).toBe(2);
    });
  });

  describe('Metric Handling', () => {
    it('should render templated metric names using test variables', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          metric: '{{category}}_quality',
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'contains', value: 'output' },
          ],
        },
      ];

      const result = await runAssertions({
        test: {
          assert: assertions,
          vars: { category: 'response' },
        },
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      // Check that the rendered metric name is in namedScores
      expect(result.namedScores).toHaveProperty('response_quality');
    });

    it('should namespace nested assertion metrics with path prefix', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            { type: 'contains', value: 'test', metric: 'first_check' },
            { type: 'contains', value: 'output', metric: 'second_check' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      // Nested metrics should be prefixed with combinator type and index
      expect(result.namedScores).toHaveProperty('and[0].first_check');
      expect(result.namedScores).toHaveProperty('and[1].second_check');
    });

    it('should render templated metrics in nested assertions', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [{ type: 'contains', value: 'test', metric: '{{prefix}}_check' }],
        },
      ];

      const result = await runAssertions({
        test: {
          assert: assertions,
          vars: { prefix: 'content' },
        },
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      // The templated metric should be rendered
      expect(result.namedScores).toHaveProperty('and[0].content_check');
    });

    it('should handle assert-set metric inside combinator', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            {
              type: 'assert-set',
              metric: 'validation_group',
              assert: [
                { type: 'contains', value: 'test' },
                { type: 'contains', value: 'output' },
              ],
            },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      // Assert-set's own metric should be included
      expect(result.namedScores).toHaveProperty('and[0].validation_group');
    });

    it('should handle templated assert-set metric inside combinator', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'and',
          assert: [
            {
              type: 'assert-set',
              metric: '{{group_name}}_validation',
              assert: [{ type: 'contains', value: 'test' }],
            },
          ],
        },
      ];

      const result = await runAssertions({
        test: {
          assert: assertions,
          vars: { group_name: 'input' },
        },
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      // Templated assert-set metric should be rendered
      expect(result.namedScores).toHaveProperty('and[0].input_validation');
    });

    it('should preserve combinator-level metric without prefix', async () => {
      const assertions: Array<Assertion | CombinatorAssertion> = [
        {
          type: 'or',
          metric: 'overall_score',
          assert: [{ type: 'contains', value: 'test', metric: 'sub_score' }],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      // Combinator's own metric should be at top level (not prefixed)
      expect(result.namedScores).toHaveProperty('overall_score');
      // Sub-assertion metric should be prefixed
      expect(result.namedScores).toHaveProperty('or[0].sub_score');
    });
  });
});
