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
});
