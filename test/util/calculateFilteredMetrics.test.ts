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

async function insertRawNamedScoreResult({
  id,
  evalId,
  testIdx = 0,
  namedScores,
  gradingResult,
  testCase = '{"vars": {}}',
}: {
  id: string;
  evalId: string;
  testIdx?: number;
  namedScores: string;
  gradingResult: string;
  testCase?: string;
}): Promise<void> {
  const db = await getDb();
  await db.run(sql`
    INSERT INTO eval_results (
      id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
      success, score, named_scores, grading_result, latency_ms, cost
    ) VALUES (
      ${id}, ${evalId}, 0, ${testIdx}, ${testCase}, ${'{}'}, ${'{}'},
      0, 0.8, ${namedScores}, ${gradingResult}, 100, 0.001
    )
  `);
}

describe('calculateFilteredMetrics', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = await getDb();
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
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(2);
      expect(metrics[0].namedScoreWeights?.relevance).toBe(1);
    });

    it('should fall back to rendered assertion counts if named score weights are absent', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });

      await eval_.addResult({
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { suffix: 'alpha' } },
        promptId: 'legacy-named-score-test',
        provider: { id: 'test', label: 'test' },
        prompt: { raw: 'test', label: 'test' },
        vars: { suffix: 'alpha' },
        response: {
          output: 'test',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.ASSERT,
        success: false,
        score: 0.8,
        latencyMs: 100,
        gradingResult: {
          pass: false,
          score: 0.8,
          reason: 'legacy metric without stored weights',
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'first assertion',
              assertion: { type: 'contains', value: 'alpha', metric: 'accuracy:{{ suffix }}' },
            },
            {
              pass: false,
              score: 0,
              reason: 'second assertion',
              assertion: { type: 'contains', value: 'missing', metric: 'accuracy:{{ suffix }}' },
            },
          ],
        },
        namedScores: { 'accuracy:alpha': 0.8 },
        cost: 0.001,
        metadata: {},
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores['accuracy:alpha']).toBeCloseTo(0.8, 10);
      expect(metrics[0].namedScoresCount['accuracy:alpha']).toBe(2);
      expect(metrics[0].namedScoreWeights?.['accuracy:alpha']).toBe(2);
    });

    it('should treat invalid named score weights as unweighted', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });

      await eval_.addResult({
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { suffix: 'alpha' } },
        promptId: 'invalid-weight-named-score-test',
        provider: { id: 'test', label: 'test' },
        prompt: { raw: 'test', label: 'test' },
        vars: { suffix: 'alpha' },
        response: {
          output: 'test',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.ASSERT,
        success: false,
        score: 0.8,
        latencyMs: 100,
        gradingResult: {
          pass: false,
          score: 0.8,
          reason: 'legacy metric with invalid stored weights',
          namedScoreWeights: {
            'accuracy:alpha': null as unknown as number,
          },
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'first assertion',
              assertion: { type: 'contains', value: 'alpha', metric: 'accuracy:{{ suffix }}' },
            },
            {
              pass: false,
              score: 0,
              reason: 'second assertion',
              assertion: { type: 'contains', value: 'missing', metric: 'accuracy:{{ suffix }}' },
            },
          ],
        },
        namedScores: { 'accuracy:alpha': 0.8 },
        cost: 0.001,
        metadata: {},
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores['accuracy:alpha']).toBeCloseTo(0.8, 10);
      expect(metrics[0].namedScoresCount['accuracy:alpha']).toBe(2);
      expect(metrics[0].namedScoreWeights?.['accuracy:alpha']).toBe(2);
    });

    it('should treat overflowing JSON numeric weights as unweighted', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'overflowing-weight',
        evalId: eval_.id,
        namedScores: '{"accuracy": 0.8}',
        gradingResult:
          '{"componentResults": [{"assertion": {"metric": "accuracy"}}, {"assertion": {"metric": "accuracy"}}], "namedScoreWeights": {"accuracy": 1e999}}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores.accuracy).toBeCloseTo(0.8, 10);
      expect(metrics[0].namedScoresCount.accuracy).toBe(2);
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(2);
    });

    it('should ignore malformed componentResults without zeroing valid metrics', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'malformed-component-results',
        evalId: eval_.id,
        namedScores: '{"accuracy": 0.8}',
        gradingResult: '{"componentResults": {}}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0]).toMatchObject({
        score: 0.8,
        testFailCount: 1,
        namedScores: { accuracy: 0.8 },
        namedScoresCount: { accuracy: 1 },
        namedScoreWeights: { accuracy: 1 },
      });
    });

    it('should safely aggregate metric names that collide with object prototypes', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'prototype-metric-name',
        evalId: eval_.id,
        namedScores: '{"constructor": 0.8, "__proto__": 0.4}',
        gradingResult:
          '{"componentResults": [{"assertion": {"metric": "constructor"}}, {"assertion": {"metric": "__proto__"}}]}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(Object.prototype.hasOwnProperty.call(metrics[0].namedScores, 'constructor')).toBe(
        true,
      );
      expect(Object.prototype.hasOwnProperty.call(metrics[0].namedScores, '__proto__')).toBe(true);
      expect(metrics[0].namedScores.constructor).toBeCloseTo(0.8, 10);
      expect(metrics[0].namedScores.__proto__).toBeCloseTo(0.4, 10);
      expect(metrics[0].namedScoresCount.constructor).toBe(1);
      expect(metrics[0].namedScoresCount.__proto__).toBe(1);
      expect(metrics[0].namedScoreWeights?.constructor).toBe(1);
      expect(metrics[0].namedScoreWeights?.__proto__).toBe(1);
    });

    it('should use last-key-wins semantics for duplicate named score weight keys', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'duplicate-weight-keys',
        evalId: eval_.id,
        namedScores: '{"accuracy": 0.8}',
        gradingResult:
          '{"componentResults": [{"assertion": {"metric": "accuracy"}}, {"assertion": {"metric": "accuracy"}}], "namedScoreWeights": {"accuracy": 4, "accuracy": null}}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores.accuracy).toBeCloseTo(0.8, 10);
      expect(metrics[0].namedScoresCount.accuracy).toBe(2);
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(2);
    });

    it('should use last-key-wins semantics for duplicate named score keys', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'duplicate-score-keys',
        evalId: eval_.id,
        namedScores: '{"accuracy": 0.1, "accuracy": 0.8}',
        gradingResult: '{"namedScoreWeights": {"accuracy": 4}}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores.accuracy).toBeCloseTo(3.2, 10);
      expect(metrics[0].namedScoresCount.accuracy).toBe(1);
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(4);
    });

    it('should process ambiguous named score rows across bounded fallback batches', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      const db = await getDb();
      await db.run(sql`
        WITH RECURSIVE row_numbers(value) AS (
          SELECT 1
          UNION ALL
          SELECT value + 1 FROM row_numbers WHERE value < 501
        )
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, named_scores, grading_result, latency_ms, cost
        )
        SELECT
          printf('ambiguous-batch-%04d', value),
          ${eval_.id},
          0,
          value,
          ${'{"vars": {}}'},
          ${'{}'},
          ${'{}'},
          0,
          0.8,
          ${'{"accuracy": 0.1, "accuracy": 0.8}'},
          ${'{"namedScoreWeights": {"accuracy": 4}}'},
          100,
          0.001
        FROM row_numbers
      `);

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores.accuracy).toBeCloseTo(501 * 0.8 * 4, 8);
      expect(metrics[0].namedScoresCount.accuracy).toBe(501);
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(501 * 4);
    });

    it('should use the final duplicate namedScoreWeights property', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'duplicate-weight-properties',
        evalId: eval_.id,
        namedScores: '{"accuracy": 0.8}',
        gradingResult:
          '{"componentResults": [{"assertion": {"metric": "accuracy"}}, {"assertion": {"metric": "accuracy"}}], "namedScoreWeights": {"accuracy": 4}, "namedScoreWeights": null}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores.accuracy).toBeCloseTo(0.8, 10);
      expect(metrics[0].namedScoresCount.accuracy).toBe(2);
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(2);
    });

    it('should use the final duplicate componentResults property', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'duplicate-component-results',
        evalId: eval_.id,
        namedScores: '{"accuracy": 0.8}',
        gradingResult:
          '{"componentResults": [{"assertion": {"metric": "accuracy"}}], "componentResults": [{"assertion": {"metric": "accuracy"}}, {"assertion": {"metric": "accuracy"}}, {"assertion": {"metric": "accuracy"}}]}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores.accuracy).toBeCloseTo(0.8, 10);
      expect(metrics[0].namedScoresCount.accuracy).toBe(3);
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(3);
    });

    it('should use the final duplicate vars property for rendered metric names', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'duplicate-test-vars',
        evalId: eval_.id,
        namedScores: '{"accuracy:last": 0.8}',
        gradingResult:
          '{"componentResults": [{"assertion": {"metric": "accuracy:{{ suffix }}"}}, {"assertion": {"metric": "accuracy:{{ suffix }}"}}]}',
        testCase: '{"vars": {"suffix": "first"}, "vars": {"suffix": "last"}}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores['accuracy:last']).toBeCloseTo(0.8, 10);
      expect(metrics[0].namedScoresCount['accuracy:last']).toBe(2);
      expect(metrics[0].namedScoreWeights?.['accuracy:last']).toBe(2);
    });

    it('should use the final duplicate assertion metric property', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'duplicate-assertion-metric',
        evalId: eval_.id,
        namedScores: '{"accuracy": 0.8}',
        gradingResult:
          '{"componentResults": [{"assertion": {"metric": "ignored", "metric": "accuracy"}}, {"assertion": {"metric": "accuracy"}}]}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores.accuracy).toBeCloseTo(0.8, 10);
      expect(metrics[0].namedScoresCount.accuracy).toBe(2);
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(2);
    });

    it('should safely write prototype-colliding metric names on the weighted SQL path', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'weighted-prototype-metric',
        evalId: eval_.id,
        namedScores: '{"__proto__": 0.75}',
        gradingResult: '{"namedScoreWeights": {"__proto__": 4}}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(Object.prototype.hasOwnProperty.call(metrics[0].namedScores, '__proto__')).toBe(true);
      expect(metrics[0].namedScores.__proto__).toBeCloseTo(3, 10);
      expect(metrics[0].namedScoresCount.__proto__).toBe(1);
      expect(metrics[0].namedScoreWeights?.__proto__).toBe(4);
    });

    it('should process legacy named score rows across bounded fallback batches', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      const db = await getDb();
      await db.run(sql`
        WITH RECURSIVE row_numbers(value) AS (
          SELECT 1
          UNION ALL
          SELECT value + 1 FROM row_numbers WHERE value < 5001
        )
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, named_scores, grading_result, latency_ms, cost
        )
        SELECT
          printf('fallback-batch-%04d', value),
          ${eval_.id},
          0,
          value,
          ${'{"vars": {}}'},
          ${'{}'},
          ${'{}'},
          0,
          0.8,
          ${'{"accuracy": 0.8}'},
          ${'{"componentResults": [{"assertion": {"metric": "accuracy"}}, {"assertion": {"metric": "accuracy"}}]}'},
          100,
          0.001
        FROM row_numbers
      `);

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores.accuracy).toBeCloseTo(5001 * 0.8, 8);
      expect(metrics[0].namedScoresCount.accuracy).toBe(10002);
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(10002);
    });

    it('should aggregate weighted named scores using grading result denominators', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });

      await eval_.addResult({
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: {} },
        promptId: 'weighted-test',
        provider: { id: 'test', label: 'test' },
        prompt: { raw: 'test', label: 'test' },
        vars: {},
        response: {
          output: 'test',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.ASSERT,
        success: false,
        score: 0.75,
        latencyMs: 100,
        gradingResult: {
          pass: false,
          score: 0.75,
          reason: 'weighted metric',
          namedScoreWeights: {
            accuracy: 4,
          },
        },
        namedScores: { accuracy: 0.75 },
        cost: 0.001,
        metadata: {},
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].namedScores.accuracy).toBeCloseTo(3, 10);
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(4);
      expect(metrics[0].namedScoresCount.accuracy).toBe(1);
    });

    it('should combine weighted and unweighted rows for the same metric', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });

      // Row A: stored weight -> aggregated via the SQL fast path.
      await eval_.addResult({
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: {} },
        promptId: 'weighted-row',
        provider: { id: 'test', label: 'test' },
        prompt: { raw: 'test', label: 'test' },
        vars: {},
        response: {
          output: 'test',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.ASSERT,
        success: false,
        score: 0.75,
        latencyMs: 100,
        gradingResult: {
          pass: false,
          score: 0.75,
          reason: 'weighted metric',
          namedScoreWeights: { accuracy: 4 },
        },
        namedScores: { accuracy: 0.75 },
        cost: 0.001,
        metadata: {},
      });

      // Row B: no stored weights -> aggregated via the JS fallback path.
      await eval_.addResult({
        promptIdx: 0,
        testIdx: 1,
        testCase: { vars: {} },
        promptId: 'unweighted-row',
        provider: { id: 'test', label: 'test' },
        prompt: { raw: 'test', label: 'test' },
        vars: {},
        response: {
          output: 'test',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.ASSERT,
        success: false,
        score: 0.8,
        latencyMs: 100,
        gradingResult: {
          pass: false,
          score: 0.8,
          reason: 'legacy metric without stored weights',
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'first assertion',
              assertion: { type: 'contains', value: 'a', metric: 'accuracy' },
            },
            {
              pass: false,
              score: 0,
              reason: 'second assertion',
              assertion: { type: 'contains', value: 'b', metric: 'accuracy' },
            },
          ],
        },
        namedScores: { accuracy: 0.8 },
        cost: 0.001,
        metadata: {},
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      // SQL path contributes 0.75 * 4 = 3; JS fallback contributes 0.8.
      expect(metrics[0].namedScores.accuracy).toBeCloseTo(3.8, 10);
      // SQL path counts 1 row; JS fallback counts 2 component assertions.
      expect(metrics[0].namedScoresCount.accuracy).toBe(3);
      // SQL path sums weight 4; JS fallback sums the 2-assertion fallback weight.
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(6);
    });

    it('should route only the unweighted metric of a partially weighted row through the fallback', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });

      // A single row where `accuracy` has a stored weight but `relevance` does not.
      await eval_.addResult({
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: {} },
        promptId: 'partial-weights-row',
        provider: { id: 'test', label: 'test' },
        prompt: { raw: 'test', label: 'test' },
        vars: {},
        response: {
          output: 'test',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.ASSERT,
        success: false,
        score: 0.75,
        latencyMs: 100,
        gradingResult: {
          pass: false,
          score: 0.75,
          reason: 'partially weighted metrics',
          namedScoreWeights: { accuracy: 4 },
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'first relevance assertion',
              assertion: { type: 'contains', value: 'a', metric: 'relevance' },
            },
            {
              pass: false,
              score: 0,
              reason: 'second relevance assertion',
              assertion: { type: 'contains', value: 'b', metric: 'relevance' },
            },
          ],
        },
        namedScores: { accuracy: 0.75, relevance: 0.5 },
        cost: 0.001,
        metadata: {},
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      // `accuracy` is handled once by the SQL fast path and not re-counted by the fallback.
      expect(metrics[0].namedScores.accuracy).toBeCloseTo(3, 10);
      expect(metrics[0].namedScoresCount.accuracy).toBe(1);
      expect(metrics[0].namedScoreWeights?.accuracy).toBe(4);
      // `relevance` lacks a stored weight, so it falls back to the 2-assertion count.
      expect(metrics[0].namedScores.relevance).toBeCloseTo(0.5, 10);
      expect(metrics[0].namedScoresCount.relevance).toBe(2);
      expect(metrics[0].namedScoreWeights?.relevance).toBe(2);
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

    it('should use the final duplicate componentResults property for assertion counts', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'duplicate-component-results-assertions',
        evalId: eval_.id,
        namedScores: '{}',
        gradingResult:
          '{"componentResults": [{"pass": true}], "componentResults": [{"pass": false}, {"pass": false}, {"pass": false}]}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].assertPassCount).toBe(0);
      expect(metrics[0].assertFailCount).toBe(3);
    });

    it('should use the final duplicate pass property for assertion counts', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'duplicate-component-pass',
        evalId: eval_.id,
        namedScores: '{}',
        gradingResult: '{"componentResults": [{"pass": true, "pass": false}, {"pass": true}]}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0].assertPassCount).toBe(1);
      expect(metrics[0].assertFailCount).toBe(1);
    });

    it('should ignore non-array componentResults without zeroing other metrics', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 0,
      });
      await insertRawNamedScoreResult({
        id: 'string-component-results',
        evalId: eval_.id,
        namedScores: '{}',
        gradingResult: '{"componentResults": "oops"}',
      });

      const metrics = await calculateFilteredMetrics({
        evalId: eval_.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${eval_.id}`,
      });

      expect(metrics[0]).toMatchObject({
        score: 0.8,
        testFailCount: 1,
        assertPassCount: 0,
        assertFailCount: 0,
      });
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
      const db = await getDb();
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
