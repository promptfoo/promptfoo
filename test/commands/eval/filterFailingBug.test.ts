/**
 * Test for the --filter-failing bug where test.vars gets mutated
 * during evaluation, causing mismatches when trying to filter failing tests.
 *
 * Bug 1: When evaluation adds runtime vars like _conversation to test.vars,
 * it mutates the original test object. This mutated test is stored in results.
 * On subsequent runs with --filter-failing, freshly loaded tests don't have
 * these runtime vars, so deepEqual comparison fails.
 *
 * Bug 2: Multi-turn strategy providers (GOAT, Crescendo, SIMBA) add sessionId
 * to vars during execution, causing the same mismatch issue.
 *
 * Fix: We filter out known runtime vars (_conversation, sessionId) during test
 * matching in resultIsForTestCase, and create a shallow copy of test.vars in
 * runEval to prevent mutation by reference.
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

  it('should match tests even when stored results have sessionId added by GOAT/Crescendo providers', async () => {
    // Simulate a redteam test suite with GOAT strategy
    const mockTestSuite: TestSuite = {
      prompts: [],
      providers: [],
      tests: [
        {
          description: 'goat-test-1',
          vars: { prompt: 'test attack prompt', goal: 'test goal' },
          assert: [],
          metadata: { pluginId: 'harmful', strategyId: 'goat' },
        },
        {
          description: 'goat-test-2',
          vars: { prompt: 'another attack prompt', goal: 'another goal' },
          assert: [],
          metadata: { pluginId: 'harmful', strategyId: 'goat' },
        },
      ],
    };

    // Simulate stored results where vars was mutated with sessionId by GOAT provider
    const mockEval = {
      id: 'eval-456',
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
            // GOAT provider added sessionId during multi-turn attack
            vars: {
              prompt: 'test attack prompt',
              goal: 'test goal',
              sessionId: 'goat-session-abc',
            },
            success: false,
            failureReason: ResultFailureReason.ERROR,
            testCase: {
              description: 'goat-test-1',
              // Stored testCase.vars has sessionId added by GOAT provider
              vars: {
                prompt: 'test attack prompt',
                goal: 'test goal',
                sessionId: 'goat-session-abc',
              },
              assert: [],
              metadata: { pluginId: 'harmful', strategyId: 'goat' },
            },
          },
        ],
        table: { head: { prompts: [], vars: [] }, body: [] },
        stats: {
          successes: 0,
          failures: 0,
          errors: 1,
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

    // When filtering error tests, it should match based on the original vars
    // not fail because of the extra sessionId property added by GOAT
    const result = await filterTests(mockTestSuite, { errorsOnly: 'eval-456' });

    // Should find the error test even though sessionId was added
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('goat-test-1');
  });

  it('should match tests with both _conversation and sessionId runtime vars', async () => {
    // Combined scenario with both runtime vars
    const mockTestSuite: TestSuite = {
      prompts: [],
      providers: [],
      tests: [
        {
          description: 'combined-test',
          vars: { input: 'hello' },
          assert: [],
        },
      ],
    };

    const mockEval = {
      id: 'eval-789',
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
            // Both runtime vars added during evaluation
            vars: {
              input: 'hello',
              _conversation: [{ role: 'user', content: 'hi' }],
              sessionId: 'session-xyz',
            },
            success: false,
            failureReason: ResultFailureReason.ASSERT,
            testCase: {
              description: 'combined-test',
              vars: {
                input: 'hello',
                _conversation: [{ role: 'user', content: 'hi' }],
                sessionId: 'session-xyz',
              },
              assert: [],
            },
          },
        ],
        table: { head: { prompts: [], vars: [] }, body: [] },
        stats: {
          successes: 0,
          failures: 1,
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

    const result = await filterTests(mockTestSuite, { failing: 'eval-789' });

    // Should match even with both runtime vars present
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('combined-test');
  });

  it('should match tests when stored results have defaultTest.vars merged', async () => {
    // Simulate a test suite with defaultTest.vars (as it would be loaded from config)
    // Note: Fresh tests don't have defaultTest.vars merged yet - that happens in prepareTests
    const mockTestSuite: TestSuite = {
      prompts: [],
      providers: [],
      defaultTest: {
        vars: {
          systemPrompt: 'You are a helpful assistant',
        },
      },
      tests: [
        {
          description: 'test-with-defaults',
          vars: { prompt: 'first test' },
          assert: [],
        },
        {
          description: 'test-that-passed',
          vars: { prompt: 'second test' },
          assert: [],
        },
      ],
    };

    // Stored results have defaultTest.vars merged (as done by prepareTests in evaluator)
    const mockEval = {
      id: 'eval-default-vars',
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
            // Stored vars have defaultTest.vars merged
            vars: { systemPrompt: 'You are a helpful assistant', prompt: 'first test' },
            success: false,
            failureReason: ResultFailureReason.ASSERT,
            testCase: {
              description: 'test-with-defaults',
              vars: { systemPrompt: 'You are a helpful assistant', prompt: 'first test' },
              assert: [],
            },
          },
        ],
        table: { head: { prompts: [], vars: [] }, body: [] },
        stats: {
          successes: 1,
          failures: 1,
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

    // filterTests should merge defaultTest.vars before comparison
    const result = await filterTests(mockTestSuite, { failing: 'eval-default-vars' });

    // Should find the failing test even though fresh test.vars doesn't have systemPrompt
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('test-with-defaults');
  });
});
