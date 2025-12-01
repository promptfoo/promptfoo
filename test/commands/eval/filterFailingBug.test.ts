/**
 * Test for the --filter-failing bug where test.vars gets mutated
 * during evaluation, causing mismatches when trying to filter failing tests.
 *
 * Bug: When evaluation adds runtime vars like _conversation to test.vars,
 * it mutates the original test object. This mutated test is stored in results.
 * On subsequent runs with --filter-failing, freshly loaded tests don't have
 * these runtime vars, so deepEqual comparison fails.
 */

import { describe, expect, it, vi } from 'vitest';

import { filterTests } from '../../../src/commands/eval/filterTests';
import Eval from '../../../src/models/eval';
import { ResultFailureReason } from '../../../src/types/index';

import type { TestSuite } from '../../../src/types/index';

vi.mock('../../../src/models/eval', () => ({
  default: {
    findById: vi.fn(),
  },
}));

describe('filterTests - vars mutation bug', () => {
  it('should match tests even when stored results have additional runtime vars', async () => {
    // Simulate a test suite as it would be loaded from config
    const mockTestSuite: TestSuite = {
      prompts: [],
      providers: [],
      tests: [
        {
          description: 'test1',
          vars: { input: 'hello', language: 'en' },
          assert: [],
        },
        {
          description: 'test2',
          vars: { input: 'goodbye', language: 'en' },
          assert: [],
        },
        {
          description: 'test3',
          vars: { input: 'thanks', language: 'en' },
          assert: [],
        },
      ],
    };

    // Simulate stored results where test.vars was mutated with _conversation
    // This is what happens in the bug - the runtime adds _conversation to vars
    const mockEval = {
      id: 'eval-123',
      createdAt: new Date().getTime(),
      config: {},
      results: [],
      resultsCount: 0,
      prompts: [],
      persisted: true,
      toEvaluateSummary: vi.fn().mockResolvedValue({
        version: 2,
        timestamp: new Date().toISOString(),
        results: [
          {
            // This test failed and has the original vars
            vars: { input: 'hello', language: 'en' },
            success: false,
            failureReason: ResultFailureReason.ASSERT,
            testCase: {
              description: 'test1',
              // Bug: stored testCase.vars has _conversation added
              vars: { input: 'hello', language: 'en', _conversation: [] },
              assert: [],
            },
          },
          {
            // This test also failed
            vars: { input: 'thanks', language: 'en' },
            success: false,
            failureReason: ResultFailureReason.ERROR,
            testCase: {
              description: 'test3',
              // Bug: stored testCase.vars has _conversation added
              vars: { input: 'thanks', language: 'en', _conversation: [] },
              assert: [],
            },
          },
        ],
        table: { head: { prompts: [], vars: [] }, body: [] },
        stats: {
          successes: 0,
          failures: 0,
          errors: 0,
          tokenUsage: {
            total: 0,
            prompt: 0,
            completion: 0,
            cached: 0,
            numRequests: 0,
            completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
          },
        },
      }),
    };

    vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);

    // When filtering failing tests, it should match based on the original vars
    // not fail because of the extra _conversation property
    const result = await filterTests(mockTestSuite, { failing: 'eval-123' });

    // Should find both failing tests
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.description)).toEqual(['test1', 'test3']);
  });
});
