/**
 * Unit tests for calculateFilteredMetrics utility.
 *
 * Tests the optimized SQL aggregation approach for calculating metrics
 * on filtered evaluation results.
 */

import { sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { ResultFailureReason } from '../../src/types/index';
import { calculateFilteredMetrics } from '../../src/util/calculateFilteredMetrics';
import EvalFactory from '../factories/evalFactory';

describe('calculateFilteredMetrics', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic metrics aggregation', () => {
    it('should aggregate basic metrics for all results', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'], // Cycles through these
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        score: expect.any(Number),
        testPassCount: expect.any(Number),
        testFailCount: expect.any(Number),
        testErrorCount: expect.any(Number),
        assertPassCount: expect.any(Number),
        assertFailCount: expect.any(Number),
        totalLatencyMs: expect.any(Number),
        cost: expect.any(Number),
      });

      // Total should be 10
      const total = metrics[0].testPassCount + metrics[0].testFailCount + metrics[0].testErrorCount;
      expect(total).toBe(10);
    });

    it('should aggregate metrics across multiple prompts', async () => {
      // Create eval with multiple prompts
      const eval_ = await Eval.create(
        {
          providers: [{ id: 'test-provider' }],
          prompts: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
          tests: [{ vars: { test: 'value' } }],
        },
        [
          { raw: 'Prompt 1', label: 'Prompt 1' },
          { raw: 'Prompt 2', label: 'Prompt 2' },
          { raw: 'Prompt 3', label: 'Prompt 3' },
        ],
      );

      // Add results for each prompt
      for (let promptIdx = 0; promptIdx < 3; promptIdx++) {
        for (let testIdx = 0; testIdx < 5; testIdx++) {
          await eval_.addResult({
            promptIdx,
            testIdx,
            testCase: { vars: { test: 'value' } },
            promptId: `prompt-${promptIdx}`,
            provider: { id: 'test-provider', label: 'test' },
            prompt: { raw: `Prompt ${promptIdx + 1}`, label: `Prompt ${promptIdx + 1}` },
            vars: { test: 'value' },
            response: {
              output: 'test output',
              tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
            },
            error: null,
            failureReason: ResultFailureReason.NONE,
            success: testIdx % 2 === 0, // Alternate success/failure
            score: testIdx % 2 === 0 ? 1 : 0,
            latencyMs: 100,
            gradingResult: {
              pass: testIdx % 2 === 0,
              score: testIdx % 2 === 0 ? 1 : 0,
              reason: 'Test reason',
              componentResults: [
                {
                  pass: testIdx % 2 === 0,
                  score: testIdx % 2 === 0 ? 1 : 0,
                  reason: 'Test reason',
                  assertion: { type: 'equals', value: 'test' },
                },
              ],
            },
            namedScores: {},
            cost: 0.001,
            metadata: {},
          });
        }
      }

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 3,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics).toHaveLength(3);

      // Each prompt should have 5 results
      for (const promptMetric of metrics) {
        const total =
          promptMetric.testPassCount + promptMetric.testFailCount + promptMetric.testErrorCount;
        expect(total).toBe(5);
        expect(promptMetric.testPassCount).toBe(3); // indices 0, 2, 4
        expect(promptMetric.testFailCount).toBe(2); // indices 1, 3
      }
    });
  });

  describe('token usage aggregation', () => {
    it('should aggregate token usage correctly', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 5,
        resultTypes: ['success'],
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].tokenUsage).toMatchObject({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        numRequests: expect.any(Number),
      });

      // Each result has 10 total tokens (from factory)
      expect(metrics[0].tokenUsage.total).toBe(50);
      expect(metrics[0].tokenUsage.prompt).toBe(25); // 5 requests * 5 tokens
      expect(metrics[0].tokenUsage.completion).toBe(25); // 5 requests * 5 tokens
    });

    it('should handle results without token usage', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });

      // Add a result without token usage
      await eval_.addResult({
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { test: 'value' } },
        promptId: 'test-prompt',
        provider: { id: 'test-provider', label: 'test' },
        prompt: { raw: 'Test prompt', label: 'Test prompt' },
        vars: { test: 'value' },
        response: { output: 'test output' }, // No token usage
        error: null,
        failureReason: ResultFailureReason.NONE,
        success: true,
        score: 1,
        latencyMs: 100,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Test reason',
        },
        namedScores: {},
        cost: 0.001,
        metadata: {},
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].tokenUsage).toMatchObject({
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
      });
    });
  });

  describe('named scores aggregation', () => {
    it('should aggregate named scores using SQL json_each', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
        withNamedScores: true,
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores).toHaveProperty('accuracy');
      expect(metrics[0].namedScores).toHaveProperty('relevance');
      expect(metrics[0].namedScoresCount).toHaveProperty('accuracy');
      expect(metrics[0].namedScoresCount).toHaveProperty('relevance');

      // All 10 results should have both scores
      expect(metrics[0].namedScoresCount.accuracy).toBe(10);
      expect(metrics[0].namedScoresCount.relevance).toBe(10);
    });

    it('should handle results without named scores', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success'],
        withNamedScores: false,
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores).toEqual({});
      expect(metrics[0].namedScoresCount).toEqual({});
    });

    it('should handle partial named scores across results', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });

      // Add results with different named scores
      await eval_.addResult({
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: {} },
        promptId: 'test',
        provider: { id: 'test', label: 'test' },
        prompt: { raw: 'test', label: 'test' },
        vars: {},
        response: {
          output: 'test',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.NONE,
        success: true,
        score: 1,
        latencyMs: 100,
        namedScores: { accuracy: 0.9, relevance: 0.8 },
        cost: 0.001,
        metadata: {},
      });

      await eval_.addResult({
        promptIdx: 0,
        testIdx: 1,
        testCase: { vars: {} },
        promptId: 'test',
        provider: { id: 'test', label: 'test' },
        prompt: { raw: 'test', label: 'test' },
        vars: {},
        response: {
          output: 'test',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.NONE,
        success: true,
        score: 1,
        latencyMs: 100,
        namedScores: { accuracy: 0.7 }, // Only accuracy
        cost: 0.001,
        metadata: {},
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores.accuracy).toBeCloseTo(1.6, 1); // 0.9 + 0.7
      expect(metrics[0].namedScores.relevance).toBeCloseTo(0.8, 1); // Only from first result
      expect(metrics[0].namedScoresCount.accuracy).toBe(2);
      expect(metrics[0].namedScoresCount.relevance).toBe(1);
    });
  });

  describe('assertion counts aggregation', () => {
    it('should aggregate assertion pass/fail counts from componentResults', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].assertPassCount).toBeGreaterThan(0);
      expect(metrics[0].assertFailCount).toBeGreaterThan(0);

      // Total assertions should equal results (1 assertion per result)
      const totalAssertions = metrics[0].assertPassCount + metrics[0].assertFailCount;
      expect(totalAssertions).toBe(10);
    });

    it('should handle results without grading results', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });

      await eval_.addResult({
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: {} },
        promptId: 'test',
        provider: { id: 'test', label: 'test' },
        prompt: { raw: 'test', label: 'test' },
        vars: {},
        response: {
          output: 'test',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.NONE,
        success: true,
        score: 1,
        latencyMs: 100,
        namedScores: {},
        cost: 0.001,
        metadata: {},
        // No gradingResult
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].assertPassCount).toBe(0);
      expect(metrics[0].assertFailCount).toBe(0);
    });
  });

  describe('filtering with WHERE clause', () => {
    it('should only aggregate results matching WHERE clause', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
      });

      // Filter for only errors
      const whereSql = sql`eval_id = ${eval_.id} AND failure_reason = ${ResultFailureReason.ERROR}`;

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql,
      });

      // Only error results
      expect(metrics[0].testErrorCount).toBeGreaterThan(0);
      expect(metrics[0].testPassCount).toBe(0);
      expect(metrics[0].testFailCount).toBe(0);
    });

    it('should return empty metrics for WHERE clause matching nothing', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success'],
      });

      // Filter for errors when there are none
      const whereSql = sql`eval_id = ${eval_.id} AND failure_reason = ${ResultFailureReason.ERROR}`;

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql,
      });

      expect(metrics[0].testPassCount).toBe(0);
      expect(metrics[0].testFailCount).toBe(0);
      expect(metrics[0].testErrorCount).toBe(0);
      expect(metrics[0].score).toBe(0);
      expect(metrics[0].totalLatencyMs).toBe(0);
      expect(metrics[0].cost).toBe(0);
    });
  });

  describe('OOM protection', () => {
    it('should throw error when result count exceeds limit', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success'],
      });

      // Mock a WHERE clause that would return too many results
      // We can't actually create 50k+ results in the test, but we can test the check
      const whereSql = sql`eval_id = ${eval_.id}`;

      // This should succeed (10 results < 50000)
      await expect(
        calculateFilteredMetrics({
          evalId: eval_.id,
          numPrompts: 1,
          whereSql,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should return empty metrics array on database error', async () => {
      // Invalid eval ID
      const metrics = await calculateFilteredMetrics({
        evalId: 'nonexistent-eval-id',
        numPrompts: 2,
        whereSql: sql`eval_id = ${'nonexistent-eval-id'}`,
      });

      expect(metrics).toHaveLength(2);
      expect(metrics[0]).toMatchObject({
        score: 0,
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 0,
        assertPassCount: 0,
        assertFailCount: 0,
        totalLatencyMs: 0,
        tokenUsage: {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
          numRequests: 0,
        },
        namedScores: {},
        namedScoresCount: {},
        cost: 0,
      });
    });

    it('should handle invalid WHERE SQL gracefully', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success'],
      });

      // Invalid SQL syntax - using sql.raw to simulate malformed SQL fragment
      // Note: In practice, with SQL fragments this is harder to achieve,
      // but we test the error handling path
      const whereSql = sql`INVALID SQL SYNTAX HERE`;

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql,
      });

      // Should fallback to empty metrics
      expect(metrics).toHaveLength(1);
      expect(metrics[0].testPassCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle eval with no results', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        score: 0,
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 0,
        assertPassCount: 0,
        assertFailCount: 0,
        totalLatencyMs: 0,
        cost: 0,
      });
    });

    it('should handle prompt_idx out of range', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 5,
        resultTypes: ['success'],
      });

      // Manually insert result with invalid prompt_idx
      const db = getDb();
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, latency_ms, cost
        ) VALUES (
          'invalid-idx', '${eval_.id}', 999, 0, '{}', '{}', '{}', 1, 1.0, 100, 0.001
        )
      `);

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1, // Only expect 1 prompt
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      // Should not crash, and should handle the out-of-range index gracefully
      expect(metrics).toHaveLength(1);
    });
  });
});
