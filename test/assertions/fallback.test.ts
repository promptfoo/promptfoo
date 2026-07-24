import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions';
import { runPython } from '../../src/python/pythonUtils';

import type { Assertion, AssertionOrSet, AtomicTestCase, ProviderResponse } from '../../src/types';

// Mock dependencies
vi.mock('../../src/cliState', () => ({
  default: {
    basePath: '/base/path',
  },
}));

vi.mock('../../src/python/pythonUtils', () => ({
  runPython: vi.fn(),
}));

// Reset mocks between tests to avoid cross-test pollution
afterEach(() => {
  vi.resetAllMocks();
});
describe('Assertion Fallback Mechanism', () => {
  const mockProviderResponse: ProviderResponse = {
    output: 'test output',
    tokenUsage: { total: 10, prompt: 5, completion: 5 },
  };

  const createTestCase = (assertions: AssertionOrSet[]): AtomicTestCase => ({
    assert: assertions,
    vars: {},
  });

  describe('Basic Fallback Chain', () => {
    it('should skip fallback when primary passes', async () => {
      const assertions: AssertionOrSet[] = [
        {
          type: 'contains',
          value: 'test',
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'nonexistent',
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1.0);
      expect(result.componentResults).toHaveLength(1);
      expect(result.componentResults?.[0]?.assertion?.value).toBe('test');
    });

    it('should execute fallback when primary fails', async () => {
      const assertions: Assertion[] = [
        {
          type: 'contains',
          value: 'nonexistent',
          fallback: 'next',
        },
        {
          type: 'equals',
          value: 'test output',
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1.0);
      // Both the failed primary and the passing fallback are surfaced in
      // componentResults so the chain's evidence is preserved.
      expect(result.componentResults).toHaveLength(2);
      const values = (result.componentResults ?? []).map((c) => c.assertion?.value);
      expect(values).toEqual(expect.arrayContaining(['nonexistent', 'test output']));
      expect(result.componentResults?.[0]?.metadata?.fallbackIntermediate).toBeUndefined();
      expect(result.componentResults?.[1]?.metadata?.fallbackIntermediate).toBe(true);
    });

    it('should use fallback: true as equivalent to fallback: next', async () => {
      const assertions: Assertion[] = [
        {
          type: 'contains',
          value: 'nonexistent',
          fallback: true,
        },
        {
          type: 'contains',
          value: 'test',
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });
  });

  describe('Multi-Level Fallback Chain', () => {
    it('should execute multi-level chain until success', async () => {
      const assertions: Assertion[] = [
        {
          type: 'equals',
          value: 'wrong value',
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'nonexistent',
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'test',
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('should return final failure if all in chain fail', async () => {
      const assertions: Assertion[] = [
        {
          type: 'equals',
          value: 'wrong',
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'nonexistent1',
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'nonexistent2',
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('Mixed Independent and Fallback Assertions', () => {
    it('should handle independent assertions alongside fallback chains', async () => {
      const assertions: Assertion[] = [
        {
          type: 'contains',
          value: 'test',
        },
        {
          type: 'equals',
          value: 'definitely-not-the-output',
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'output',
        },
        {
          type: 'is-json',
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      // Three scoring contributors: 2 independents (one fails, one passes)
      // plus the chain's fallback target (passes). The failed `is-json` keeps
      // pass=false, and the chain's failed primary is surfaced in
      // componentResults but does not affect the score.
      expect(result.pass).toBe(false);
      expect(result.score).toBe(2 / 3);
      expect(result.componentResults).toHaveLength(4);
    });
  });

  describe('Validation', () => {
    it('should throw error if fallback points to nothing', async () => {
      const assertions: AssertionOrSet[] = [
        {
          type: 'equals',
          value: 'wrong',
          fallback: 'next',
        },
      ];

      await expect(async () => {
        await runAssertions({
          test: createTestCase(assertions),
          providerResponse: mockProviderResponse,
        });
      }).rejects.toThrow('no next assertion to fall through to');
    });

    it('should include the assert-set path in the error when the bad fallback is inside a set', async () => {
      const assertions: AssertionOrSet[] = [
        { type: 'contains', value: 'test' },
        {
          type: 'assert-set',
          assert: [
            { type: 'contains', value: 'output' },
            { type: 'equals', value: 'wrong', fallback: 'next' },
          ],
        },
      ];

      await expect(async () => {
        await runAssertions({
          test: createTestCase(assertions),
          providerResponse: mockProviderResponse,
        });
      }).rejects.toThrow(/assert\[1\]\.assert\[1\].*no next assertion/);
    });

    it('should throw error if fallback points to assert-set', async () => {
      const assertions: AssertionOrSet[] = [
        {
          type: 'equals',
          value: 'wrong',
          fallback: 'next',
        },
        {
          type: 'assert-set',
          assert: [
            {
              type: 'contains',
              value: 'test',
            },
          ],
        },
      ];

      await expect(async () => {
        await runAssertions({
          test: createTestCase(assertions),
          providerResponse: mockProviderResponse,
        });
      }).rejects.toThrow('assert-set (not supported as fallback target)');
    });

    it('should throw error if fallback points to select-best', async () => {
      const assertions: Assertion[] = [
        {
          type: 'equals',
          value: 'wrong',
          fallback: 'next',
        },
        {
          type: 'select-best',
          value: 'Choose the best output',
        },
      ];

      await expect(async () => {
        await runAssertions({
          test: createTestCase(assertions),
          providerResponse: mockProviderResponse,
        });
      }).rejects.toThrow('select-best (not supported as fallback target)');
    });

    it('should throw error if select-best starts a fallback chain', async () => {
      const assertions: Assertion[] = [
        {
          type: 'select-best',
          value: 'Choose the best output',
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'test',
        },
      ];

      await expect(async () => {
        await runAssertions({
          test: createTestCase(assertions),
          providerResponse: mockProviderResponse,
        });
      }).rejects.toThrow('select-best assertions cannot be fallback chain sources');
    });

    it('should throw error if redteam guardrails start a fallback chain', async () => {
      const assertions: Assertion[] = [
        {
          type: 'guardrails',
          config: { purpose: 'redteam' },
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'test',
        },
      ];

      await expect(async () => {
        await runAssertions({
          test: createTestCase(assertions),
          providerResponse: mockProviderResponse,
        });
      }).rejects.toThrow('redteam guardrail assertions cannot be fallback chain sources');
    });
  });

  describe('Score Calculation', () => {
    it('should not include bypassed assertion scores', async () => {
      const assertions: Assertion[] = [
        {
          type: 'equals',
          value: 'wrong value',
          weight: 2,
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'test',
          weight: 1,
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      // Only the fallback's score should count (1.0 * 1)
      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
    });

    it('should use fallback assertion weight, not primary weight', async () => {
      const assertions: Assertion[] = [
        {
          type: 'equals',
          value: 'wrong',
          weight: 5,
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'test',
          weight: 2,
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      // Should use weight of 2, not 5
      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
    });
  });

  describe('Telemetry preservation', () => {
    it('surfaces every failed primary in componentResults across a multi-level chain', async () => {
      const assertions: Assertion[] = [
        { type: 'equals', value: 'wrong-1', fallback: 'next' },
        { type: 'equals', value: 'wrong-2', fallback: 'next' },
        { type: 'contains', value: 'test' },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
      expect(result.componentResults).toHaveLength(3);
      const passes = (result.componentResults ?? []).map((r) => r.pass);
      expect(passes.filter((p) => p === false)).toHaveLength(2);
      expect(passes.filter((p) => p === true)).toHaveLength(1);
    });

    it('records every executed assertion when the entire chain fails', async () => {
      const assertions: Assertion[] = [
        { type: 'equals', value: 'wrong-1', fallback: 'next' },
        { type: 'contains', value: 'wrong-2', fallback: 'next' },
        { type: 'contains', value: 'wrong-3' },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(false);
      expect(result.componentResults).toHaveLength(3);
      const passes = (result.componentResults ?? []).map((r) => r.pass);
      expect(passes.every((p) => p === false)).toBe(true);
    });

    it('keeps named metrics for assertions that execute before a fallback passes', async () => {
      const assertions: Assertion[] = [
        {
          type: 'equals',
          value: 'wrong',
          metric: 'primary',
          weight: 3,
          fallback: 'next',
        },
        {
          type: 'contains',
          value: 'test',
          metric: 'fallback',
          weight: 2,
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.score).toBe(1);
      expect(result.namedScores).toEqual({
        primary: 0,
        fallback: 1,
      });
      expect(result.namedScoreWeights).toEqual({
        primary: 3,
        fallback: 2,
      });
    });

    it('does not add named metrics for a fallback assertion that is bypassed', async () => {
      const assertions: Assertion[] = [
        {
          type: 'contains',
          value: 'test',
          metric: 'primary',
          fallback: 'next',
        },
        {
          type: 'equals',
          value: 'not executed',
          metric: 'fallback',
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.namedScores).toEqual({ primary: 1 });
      expect(result.namedScoreWeights).toEqual({ primary: 1 });
    });
  });

  describe('Failure boundaries in chain primaries', () => {
    it('propagates a thrown primary even when fallback is set', async () => {
      const assertions: Assertion[] = [
        {
          type: 'this-type-does-not-exist' as any,
          fallback: 'next',
        },
        { type: 'contains', value: 'test' },
      ];

      await expect(
        runAssertions({
          test: createTestCase(assertions),
          providerResponse: mockProviderResponse,
        }),
      ).rejects.toThrow('Unknown assertion type');
    });

    it('still propagates throws from the terminal (non-fallback) link', async () => {
      const assertions: Assertion[] = [
        { type: 'equals', value: 'wrong', fallback: 'next' },
        { type: 'this-type-does-not-exist' as any },
      ];

      await expect(
        runAssertions({
          test: createTestCase(assertions),
          providerResponse: mockProviderResponse,
        }),
      ).rejects.toThrow('Unknown assertion type');
    });

    it('does not fall through a tagged grader failure', async () => {
      const assertions: Assertion[] = [
        {
          type: 'javascript',
          value: () => ({
            pass: false,
            score: 0,
            reason: 'grader unavailable',
            metadata: { graderError: true as const },
          }),
          fallback: 'next',
        },
        { type: 'contains', value: 'test' },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(false);
      expect(result.reason).toBe('grader unavailable');
      expect(result.componentResults).toHaveLength(1);
      expect(result.componentResults?.[0].metadata?.graderError).toBe(true);
    });

    it('does not fall through a JavaScript execution error', async () => {
      const assertions: Assertion[] = [
        {
          type: 'javascript',
          value: () => {
            throw new Error('boom');
          },
          fallback: 'next',
        },
        { type: 'contains', value: 'test' },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Custom function threw error: boom');
      expect(result.componentResults).toHaveLength(1);
      expect(result.componentResults?.[0].metadata?.assertionError).toBe(true);
    });

    it('does not fall through a file-backed assertion execution error', async () => {
      vi.mocked(runPython).mockRejectedValueOnce(new Error('Python exploded'));
      const assertions: Assertion[] = [
        {
          type: 'contains',
          value: 'file://bad.py',
          fallback: 'next',
        },
        { type: 'contains', value: 'test' },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(false);
      expect(result.reason).toBe('Python exploded');
      expect(result.componentResults).toHaveLength(1);
      expect(result.componentResults?.[0].metadata?.assertionError).toBe(true);
    });
  });

  describe('Schema variants', () => {
    it('treats fallback: false as a no-op (independent assertion)', async () => {
      const assertions: Assertion[] = [
        { type: 'contains', value: 'nonexistent', fallback: false as any },
        { type: 'contains', value: 'test' },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      // Both assertions are independent; the first fails so the test fails.
      expect(result.pass).toBe(false);
      expect(result.componentResults).toHaveLength(2);
    });
  });

  describe('Fallback chains inside assert-set', () => {
    it('runs a chain inside a set and writes results to that set only', async () => {
      const assertions: AssertionOrSet[] = [
        { type: 'contains', value: 'test' },
        {
          type: 'assert-set',
          assert: [
            { type: 'equals', value: 'wrong', fallback: 'next' },
            { type: 'contains', value: 'output' },
          ],
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      // Top-level componentResults: 1 independent + 1 assert-set entry,
      // and the set's own componentResults are flattened in.
      expect((result.componentResults ?? []).length).toBeGreaterThanOrEqual(2);
    });

    it('does not let a chain bridge across an assert-set boundary', async () => {
      const assertions: AssertionOrSet[] = [
        {
          type: 'assert-set',
          assert: [
            // Last in its set; must NOT be flagged as cross-set chain bleed.
            { type: 'contains', value: 'test' },
          ],
        },
        // Has fallback: next at the top level. Validation should flag this
        // as last-in-list because the chain cannot reach into a separate set
        // either before or after.
        { type: 'equals', value: 'wrong', fallback: 'next' },
      ];

      await expect(
        runAssertions({
          test: createTestCase(assertions),
          providerResponse: mockProviderResponse,
        }),
      ).rejects.toThrow('no next assertion to fall through to');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty assertion list', async () => {
      const result = await runAssertions({
        test: createTestCase([]),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(result.reason).toBe('No assertions');
    });

    it('should handle assertion without fallback normally', async () => {
      const assertions: Assertion[] = [
        {
          type: 'contains',
          value: 'test',
        },
      ];

      const result = await runAssertions({
        test: createTestCase(assertions),
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });
  });
});
