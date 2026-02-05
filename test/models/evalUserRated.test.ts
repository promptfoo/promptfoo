import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HUMAN_ASSERTION_TYPE } from '../../src/constants';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import { queryTestIndicesOptimized } from '../../src/models/evalPerformance';
import { ResultFailureReason } from '../../src/types/index';
import EvalFactory from '../factories/evalFactory';

import type { EvaluateResult, GradingResult } from '../../src/types/index';

/**
 * Helper to create a GradingResult with a human rating assertion.
 */
function createHumanRatedGradingResult(
  pass: boolean,
  score: number,
  reason: string,
): GradingResult {
  return {
    pass,
    score,
    reason,
    namedScores: {},
    tokensUsed: { total: 10, prompt: 5, completion: 5 },
    componentResults: [
      {
        assertion: {
          type: HUMAN_ASSERTION_TYPE,
        },
        pass,
        score,
        reason,
      },
    ],
  };
}

/**
 * Helper to create a regular (non-human-rated) GradingResult.
 */
function createRegularGradingResult(pass: boolean, score: number): GradingResult {
  return {
    pass,
    score,
    reason: pass ? 'Test passed' : 'Test failed',
    namedScores: {},
    tokensUsed: { total: 10, prompt: 5, completion: 5 },
    componentResults: [
      {
        assertion: {
          type: 'equals',
        },
        pass,
        score,
        reason: pass ? 'Values match' : 'Values differ',
      },
    ],
  };
}

describe('User-Rated Filter Feature', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    // Clear all tables before each test
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
  });

  describe('Eval.queryTestIndices user-rated filter', () => {
    it('should return only user-rated results when filterMode is user-rated', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add results with various user rating scenarios
      const results = [
        { testIdx: 0, hasHumanRating: true, pass: true },
        { testIdx: 1, hasHumanRating: false, pass: true },
        { testIdx: 2, hasHumanRating: true, pass: false },
        { testIdx: 3, hasHumanRating: false, pass: false },
        { testIdx: 4, hasHumanRating: true, pass: true },
      ];

      for (const result of results) {
        await eval_.addResult({
          description: `test-${result.testIdx}`,
          promptIdx: 0,
          testIdx: result.testIdx,
          testCase: { vars: { test: `value${result.testIdx}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${result.testIdx}` },
          response: { output: `Response ${result.testIdx}` },
          error: null,
          failureReason: result.pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
          success: result.pass,
          score: result.pass ? 1 : 0,
          latencyMs: 100,
          gradingResult: result.hasHumanRating
            ? createHumanRatedGradingResult(result.pass, result.pass ? 1 : 0, 'User rated')
            : createRegularGradingResult(result.pass, result.pass ? 1 : 0),
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      // Test user-rated filter
      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'user-rated',
      });

      // Should return only test indices 0, 2, and 4 (those with human ratings)
      expect(filteredCount).toBe(3);
      expect(testIndices).toEqual([0, 2, 4]);
    });

    it('should handle empty dataset with user-rated filter', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'user-rated',
      });

      expect(filteredCount).toBe(0);
      expect(testIndices).toEqual([]);
    });

    it('should handle dataset with no user-rated results', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 5,
        resultTypes: ['success', 'failure'],
      });

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'user-rated',
      });

      expect(filteredCount).toBe(0);
      expect(testIndices).toEqual([]);
    });

    it('should work with pagination when filtering user-rated', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add 10 user-rated results
      for (let i = 0; i < 10; i++) {
        await eval_.addResult({
          description: `test-${i}`,
          promptIdx: 0,
          testIdx: i,
          testCase: { vars: { test: `value${i}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${i}` },
          response: { output: `Response ${i}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: createHumanRatedGradingResult(true, 1, `User rated item ${i}`),
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      // Test pagination
      const page1 = await (eval_ as any).queryTestIndices({
        filterMode: 'user-rated',
        offset: 0,
        limit: 5,
      });

      const page2 = await (eval_ as any).queryTestIndices({
        filterMode: 'user-rated',
        offset: 5,
        limit: 5,
      });

      expect(page1.filteredCount).toBe(10);
      expect(page1.testIndices).toEqual([0, 1, 2, 3, 4]);

      expect(page2.filteredCount).toBe(10);
      expect(page2.testIndices).toEqual([5, 6, 7, 8, 9]);
    });

    it('should combine user-rated filter with search query', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      const testData = [
        { testIdx: 0, hasHumanRating: true, output: 'Response with needle' },
        { testIdx: 1, hasHumanRating: true, output: 'Different response' },
        { testIdx: 2, hasHumanRating: false, output: 'Contains needle' },
        { testIdx: 3, hasHumanRating: true, output: 'Another needle' },
      ];

      for (const data of testData) {
        await eval_.addResult({
          description: `test-${data.testIdx}`,
          promptIdx: 0,
          testIdx: data.testIdx,
          testCase: { vars: { test: `value${data.testIdx}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${data.testIdx}` },
          response: { output: data.output },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: data.hasHumanRating
            ? createHumanRatedGradingResult(true, 1, 'User rated')
            : createRegularGradingResult(true, 1),
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      // Search for "needle" with user-rated filter
      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'user-rated',
        searchQuery: 'needle',
      });

      // Should return only user-rated results that also contain "needle"
      expect(filteredCount).toBe(2);
      expect(testIndices).toEqual([0, 3]);
    });

    it('should handle malformed grading results gracefully', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });
      const db = getDb();

      // Insert a result with null grading_result
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0, NULL
        )
      `);

      // Insert a result with empty componentResults
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test2', '${eval_.id}', 0, 1, '{}', '{}', '{}', 1, 1.0,
          '{"pass": true, "score": 1, "componentResults": []}'
        )
      `);

      // Insert a valid user-rated result
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test3', '${eval_.id}', 0, 2, '{}', '{}', '{}', 1, 1.0,
          '{"pass": true, "score": 1, "componentResults": [{"assertion": {"type": "human"}, "pass": true, "score": 1, "reason": "Good"}]}'
        )
      `);

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'user-rated',
      });

      // Should only return the valid user-rated result
      expect(filteredCount).toBe(1);
      expect(testIndices).toEqual([2]);
    });

    it('should distinguish human assertions from other assertion types', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });
      const db = getDb();

      // Result with 'human' assertion type (should match)
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0,
          '{"pass": true, "score": 1, "componentResults": [{"assertion": {"type": "human"}, "pass": true, "score": 1}]}'
        )
      `);

      // Result with 'equals' assertion type (should NOT match)
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test2', '${eval_.id}', 0, 1, '{}', '{}', '{}', 1, 1.0,
          '{"pass": true, "score": 1, "componentResults": [{"assertion": {"type": "equals"}, "pass": true, "score": 1}]}'
        )
      `);

      // Result with 'humanoid' assertion type (should NOT match - avoid false positives)
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test3', '${eval_.id}', 0, 2, '{}', '{}', '{}', 1, 1.0,
          '{"pass": true, "score": 1, "componentResults": [{"assertion": {"type": "humanoid"}, "pass": true, "score": 1}]}'
        )
      `);

      // Result with 'is-human' assertion type (should NOT match)
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test4', '${eval_.id}', 0, 3, '{}', '{}', '{}', 1, 1.0,
          '{"pass": true, "score": 1, "componentResults": [{"assertion": {"type": "is-human"}, "pass": true, "score": 1}]}'
        )
      `);

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'user-rated',
      });

      // Should only return test index 0 (the one with exactly 'human' assertion type)
      expect(filteredCount).toBe(1);
      expect(testIndices).toEqual([0]);
    });
  });

  describe('evalPerformance.queryTestIndicesOptimized user-rated filter', () => {
    it('should return only user-rated results with optimized query', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add test data
      const results = [
        { testIdx: 0, hasHumanRating: true },
        { testIdx: 1, hasHumanRating: false },
        { testIdx: 2, hasHumanRating: true },
      ];

      for (const result of results) {
        await eval_.addResult({
          description: `test-${result.testIdx}`,
          promptIdx: 0,
          testIdx: result.testIdx,
          testCase: { vars: { test: `value${result.testIdx}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${result.testIdx}` },
          response: { output: `Response ${result.testIdx}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: result.hasHumanRating
            ? createHumanRatedGradingResult(true, 1, 'User rated')
            : createRegularGradingResult(true, 1),
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      const { testIndices, filteredCount } = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'user-rated',
      });

      expect(filteredCount).toBe(2);
      expect(testIndices).toEqual([0, 2]);
    });

    it('should handle large datasets efficiently', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add 100 results, every 5th one is user-rated
      for (let i = 0; i < 100; i++) {
        const hasHumanRating = i % 5 === 0;
        await eval_.addResult({
          description: `test-${i}`,
          promptIdx: 0,
          testIdx: i,
          testCase: { vars: { test: `value${i}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${i}` },
          response: { output: `Response ${i}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: hasHumanRating
            ? createHumanRatedGradingResult(true, 1, `User rated ${i}`)
            : createRegularGradingResult(true, 1),
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      const startTime = Date.now();
      const { testIndices, filteredCount } = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'user-rated',
        limit: 10,
      });
      const duration = Date.now() - startTime;

      // Should have 20 user-rated items (0, 5, 10, 15, ...)
      expect(filteredCount).toBe(20);
      expect(testIndices).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45]);

      // Query should be fast (typically under 100ms for 100 items)
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Integration with getTablePage', () => {
    it('should filter user-rated correctly through getTablePage', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add mixed results
      for (let i = 0; i < 6; i++) {
        const hasHumanRating = i % 2 === 0;
        await eval_.addResult({
          description: `test-${i}`,
          promptIdx: 0,
          testIdx: i,
          testCase: { vars: { test: `value${i}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${i}` },
          response: { output: `Response ${i}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: hasHumanRating
            ? createHumanRatedGradingResult(true, 1, `User rated ${i}`)
            : createRegularGradingResult(true, 1),
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      const result = await eval_.getTablePage({
        filterMode: 'user-rated',
        filters: [],
      });

      // Should have 3 user-rated results (0, 2, 4)
      expect(result.filteredCount).toBe(3);
      expect(result.body.length).toBe(3);

      // Verify the test indices in the body
      const testIndices = result.body.map((row) => row.testIdx);
      expect(testIndices).toEqual([0, 2, 4]);

      // Verify each result has a human assertion in componentResults
      for (const row of result.body) {
        const hasHumanRating = row.outputs.some((output) =>
          output.gradingResult?.componentResults?.some(
            (cr) => cr.assertion?.type === HUMAN_ASSERTION_TYPE,
          ),
        );
        expect(hasHumanRating).toBe(true);
      }
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle results with null componentResults', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });
      const db = getDb();

      // Insert result with grading_result but null componentResults
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0,
          '{"pass": true, "score": 1, "reason": "Test", "componentResults": null}'
        )
      `);

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'user-rated',
      });

      expect(filteredCount).toBe(0);
      expect(testIndices).toEqual([]);
    });

    it('should handle results with multiple componentResults including human', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });
      const db = getDb();

      // Result with multiple componentResults, one of which is human
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0,
          '{"pass": true, "score": 1, "componentResults": [
            {"assertion": {"type": "equals"}, "pass": true, "score": 1},
            {"assertion": {"type": "human"}, "pass": true, "score": 1},
            {"assertion": {"type": "contains"}, "pass": true, "score": 1}
          ]}'
        )
      `);

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'user-rated',
      });

      expect(filteredCount).toBe(1);
      expect(testIndices).toEqual([0]);
    });

    it('should handle concurrent access to user-rated filter', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add some user-rated results
      for (let i = 0; i < 10; i++) {
        await eval_.addResult({
          description: `test-${i}`,
          promptIdx: 0,
          testIdx: i,
          testCase: { vars: { test: `value${i}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${i}` },
          response: { output: `Response ${i}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: createHumanRatedGradingResult(true, 1, `User rated ${i}`),
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      // Run multiple queries concurrently
      const promises = Array.from({ length: 5 }, () =>
        (eval_ as any).queryTestIndices({ filterMode: 'user-rated' }),
      );

      const results = await Promise.all(promises);

      // All concurrent queries should return the same results
      const firstResult = results[0];
      for (const result of results) {
        expect(result.filteredCount).toBe(firstResult.filteredCount);
        expect(result.testIndices).toEqual(firstResult.testIndices);
      }
    });

    it('should verify SQL injection safety', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add a user-rated result
      await eval_.addResult({
        description: 'test-safe',
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { test: 'value' } },
        promptId: 'test-prompt',
        provider: { id: 'test-provider', label: 'test-label' },
        prompt: { raw: 'Test prompt', label: 'Test prompt' },
        vars: { test: 'value' },
        response: { output: 'Safe response' },
        error: null,
        failureReason: ResultFailureReason.NONE,
        success: true,
        score: 1,
        latencyMs: 100,
        gradingResult: createHumanRatedGradingResult(true, 1, 'User rated'),
        namedScores: {},
        cost: 0.007,
        metadata: {},
      } as EvaluateResult);

      // Try SQL injection in search query
      const maliciousSearch = "'; DROP TABLE eval_results; --";
      const { filteredCount } = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'user-rated',
        searchQuery: maliciousSearch,
      });

      // Should not match the malicious search string
      expect(filteredCount).toBe(0);

      // Test that user-rated filter still works after attempted injection
      const justUserRated = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'user-rated',
      });
      expect(justUserRated.filteredCount).toBe(1);
      expect(justUserRated.testIndices).toEqual([0]);
    });
  });
});
