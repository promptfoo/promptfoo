import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions';

import type { Assertion, AtomicTestCase, ProviderResponse } from '../../src/types';

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

  const createTestCase = (assertions: Assertion[]): AtomicTestCase => ({
    assert: assertions,
    vars: {},
  });

  describe('Basic Fallback Chain', () => {
    it('should skip fallback when primary passes', async () => {
      const assertions: Assertion[] = [
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
          type: 'javascript',
          value: 'return { pass: false, score: 0 };',
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

      // First independent passes, fallback chain passes (2nd fails, 3rd passes), 4th fails
      // Score should reflect this
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('Validation', () => {
    it('should throw error if fallback points to nothing', async () => {
      const assertions: Assertion[] = [
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
      }).rejects.toThrow('fallback: next but is the last assertion');
    });

    it('should throw error if fallback points to assert-set', async () => {
      const assertions: Assertion[] = [
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
        } as any,
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
