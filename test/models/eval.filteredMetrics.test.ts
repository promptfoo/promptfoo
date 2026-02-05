/**
 * CRITICAL TEST: WHERE clause consistency between pagination and metrics.
 *
 * This test ensures that queryTestIndices() and getFilteredMetrics() use
 * the EXACT SAME WHERE clause logic, preventing silent data corruption where
 * metrics don't match the displayed results.
 *
 * If these tests fail, it means the two methods have diverged and metrics
 * will be inaccurate!
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import EvalFactory from '../factories/evalFactory';

describe('Filtered Metrics - WHERE Clause Consistency', () => {
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

  afterEach(() => {
    vi.resetAllMocks();
  });

  /**
   * CRITICAL TEST #1: Row count consistency
   *
   * The number of rows in pagination MUST match the sum of test counts in metrics.
   * If this fails, the WHERE clauses have diverged!
   */
  describe('CRITICAL: Row count consistency', () => {
    it('should return same row count for pagination and metrics with no filters', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
      });

      const { testIndices } = await (eval_ as any).queryTestIndices({});
      const metrics = await eval_.getFilteredMetrics({});

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
    });

    it('should return same row count for pagination and metrics with filterMode=errors', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
      });

      const { testIndices } = await (eval_ as any).queryTestIndices({ filterMode: 'errors' });
      const metrics = await eval_.getFilteredMetrics({ filterMode: 'errors' });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
      expect(testIndices.length).toBeGreaterThan(0); // Sanity check
    });

    it('should return same row count for pagination and metrics with filterMode=failures', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
      });

      const { testIndices } = await (eval_ as any).queryTestIndices({ filterMode: 'failures' });
      const metrics = await eval_.getFilteredMetrics({ filterMode: 'failures' });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
      expect(testIndices.length).toBeGreaterThan(0); // Sanity check
    });

    it('should return same row count for pagination and metrics with filterMode=passes', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
      });

      const { testIndices } = await (eval_ as any).queryTestIndices({ filterMode: 'passes' });
      const metrics = await eval_.getFilteredMetrics({ filterMode: 'passes' });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
      expect(testIndices.length).toBeGreaterThan(0); // Sanity check
    });

    it('should return same row count for pagination and metrics with filterMode=highlights', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
        withHighlights: true,
      });

      const { testIndices } = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
      });
      const metrics = await eval_.getFilteredMetrics({ filterMode: 'highlights' });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
      expect(testIndices.length).toBeGreaterThan(0); // Sanity check
    });

    it('should return same row count for pagination and metrics with searchQuery', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
        searchableContent: 'searchable_content',
      });

      const searchQuery = 'searchable_content';
      const { testIndices } = await (eval_ as any).queryTestIndices({ searchQuery });
      const metrics = await eval_.getFilteredMetrics({ searchQuery });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
      expect(testIndices.length).toBeGreaterThan(0); // Sanity check
    });

    it('should return same row count for pagination and metrics with metadata filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      // Add metadata to some rows
      const db = getDb();
      await db.run(
        `UPDATE eval_results SET metadata = json('{"source":"unit"}') WHERE eval_id = '${eval_.id}' AND test_idx IN (1, 3, 5)`,
      );

      const filters = [
        JSON.stringify({
          logicOperator: 'and',
          type: 'metadata',
          operator: 'equals',
          field: 'source',
          value: 'unit',
        }),
      ];

      const { testIndices } = await (eval_ as any).queryTestIndices({ filters });
      const metrics = await eval_.getFilteredMetrics({ filters });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
      expect(testIndices.length).toBe(3); // Sanity check
    });

    it('should return same row count for pagination and metrics with plugin filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const db = getDb();
      await db.run(
        `UPDATE eval_results SET metadata = json('{"pluginId":"harmful:harassment"}') WHERE eval_id = '${eval_.id}' AND test_idx IN (2, 4, 6)`,
      );

      const filters = [
        JSON.stringify({
          logicOperator: 'and',
          type: 'plugin',
          operator: 'equals',
          value: 'harmful',
        }),
      ];

      const { testIndices } = await (eval_ as any).queryTestIndices({ filters });
      const metrics = await eval_.getFilteredMetrics({ filters });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
      expect(testIndices.length).toBe(3); // Sanity check
    });

    it('should return same row count for pagination and metrics with strategy filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const db = getDb();
      await db.run(
        `UPDATE eval_results SET metadata = json('{"strategyId":"jailbreak"}') WHERE eval_id = '${eval_.id}' AND test_idx IN (1, 2, 3)`,
      );

      const filters = [
        JSON.stringify({
          logicOperator: 'and',
          type: 'strategy',
          operator: 'equals',
          value: 'jailbreak',
        }),
      ];

      const { testIndices } = await (eval_ as any).queryTestIndices({ filters });
      const metrics = await eval_.getFilteredMetrics({ filters });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
      expect(testIndices.length).toBe(3); // Sanity check
    });

    it('should return same row count for pagination and metrics with severity filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const db = getDb();
      await db.run(
        `UPDATE eval_results SET metadata = json('{"severity":"high"}') WHERE eval_id = '${eval_.id}' AND test_idx IN (0, 5)`,
      );

      const filters = [
        JSON.stringify({
          logicOperator: 'and',
          type: 'severity',
          operator: 'equals',
          value: 'high',
        }),
      ];

      const { testIndices } = await (eval_ as any).queryTestIndices({ filters });
      const metrics = await eval_.getFilteredMetrics({ filters });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
      expect(testIndices.length).toBe(2); // Sanity check
    });

    it('should return same row count for pagination and metrics with metric filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
        withNamedScores: true,
      });

      const filters = [
        JSON.stringify({
          logicOperator: 'and',
          type: 'metric',
          operator: 'equals',
          value: 'accuracy',
        }),
      ];

      const { testIndices } = await (eval_ as any).queryTestIndices({ filters });
      const metrics = await eval_.getFilteredMetrics({ filters });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
      expect(testIndices.length).toBe(10); // All have named scores
    });

    it('should return same row count for pagination and metrics with combined filters', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
        withHighlights: true,
        withNamedScores: true,
        searchableContent: 'searchable',
      });

      const db = getDb();
      await db.run(
        `UPDATE eval_results SET metadata = json('{"source":"unit","severity":"high"}') WHERE eval_id = '${eval_.id}' AND test_idx IN (3, 6, 9)`,
      );

      const filters = [
        JSON.stringify({
          logicOperator: 'and',
          type: 'metadata',
          operator: 'equals',
          field: 'source',
          value: 'unit',
        }),
      ];

      const { testIndices } = await (eval_ as any).queryTestIndices({
        filterMode: 'failures',
        searchQuery: 'searchable',
        filters,
      });

      const metrics = await eval_.getFilteredMetrics({
        filterMode: 'failures',
        searchQuery: 'searchable',
        filters,
      });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(metricsTotal);
    });
  });

  /**
   * CRITICAL TEST #2: Empty result handling
   *
   * When no results match the filter, both methods must return zero counts.
   */
  describe('CRITICAL: Empty result handling', () => {
    it('should return zero counts when no results match filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success'],
      });

      // Filter for errors when there are none
      const { testIndices } = await (eval_ as any).queryTestIndices({ filterMode: 'errors' });
      const metrics = await eval_.getFilteredMetrics({ filterMode: 'errors' });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(0);
      expect(metricsTotal).toBe(0);
    });

    it('should return zero counts when search matches nothing', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const searchQuery = 'nonexistent_search_term_xyz';
      const { testIndices } = await (eval_ as any).queryTestIndices({ searchQuery });
      const metrics = await eval_.getFilteredMetrics({ searchQuery });

      const metricsTotal = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      expect(testIndices.length).toBe(0);
      expect(metricsTotal).toBe(0);
    });
  });

  /**
   * CRITICAL TEST #3: Metrics correctness
   *
   * Not only should the counts match, but the actual metrics should be correct
   * based on the filtered dataset.
   */
  describe('CRITICAL: Metrics correctness', () => {
    it('should calculate correct metrics for filtered failures', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'], // Cycles: success, error, failure, success, error, failure...
      });

      const metrics = await eval_.getFilteredMetrics({ filterMode: 'failures' });

      // With cycling pattern, we expect roughly 1/3 failures
      const totalTests = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      const failCount = metrics.reduce((sum, m) => sum + m.testFailCount, 0);

      expect(totalTests).toBeGreaterThan(0);
      expect(failCount).toBe(totalTests); // All filtered results should be failures
      expect(metrics[0].testPassCount).toBe(0); // No passes in failure filter
      expect(metrics[0].testErrorCount).toBe(0); // No errors in failure filter
    });

    it('should calculate correct metrics for filtered passes', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
      });

      const metrics = await eval_.getFilteredMetrics({ filterMode: 'passes' });

      const totalTests = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      const passCount = metrics.reduce((sum, m) => sum + m.testPassCount, 0);

      expect(totalTests).toBeGreaterThan(0);
      expect(passCount).toBe(totalTests); // All filtered results should be passes
      expect(metrics[0].testFailCount).toBe(0); // No failures in pass filter
      expect(metrics[0].testErrorCount).toBe(0); // No errors in pass filter
    });

    it('should calculate correct metrics for filtered errors', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
      });

      const metrics = await eval_.getFilteredMetrics({ filterMode: 'errors' });

      const totalTests = metrics.reduce(
        (sum, m) => sum + m.testPassCount + m.testFailCount + m.testErrorCount,
        0,
      );

      const errorCount = metrics.reduce((sum, m) => sum + m.testErrorCount, 0);

      expect(totalTests).toBeGreaterThan(0);
      expect(errorCount).toBe(totalTests); // All filtered results should be errors
      expect(metrics[0].testPassCount).toBe(0); // No passes in error filter
      expect(metrics[0].testFailCount).toBe(0); // No failures in error filter
    });

    it('should include named scores only from filtered results', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
        withNamedScores: true,
      });

      // All results have accuracy and relevance scores
      const allMetrics = await eval_.getFilteredMetrics({});
      const passMetrics = await eval_.getFilteredMetrics({ filterMode: 'passes' });

      // Both should have named scores
      expect(allMetrics[0].namedScores).toHaveProperty('accuracy');
      expect(allMetrics[0].namedScores).toHaveProperty('relevance');
      expect(passMetrics[0].namedScores).toHaveProperty('accuracy');
      expect(passMetrics[0].namedScores).toHaveProperty('relevance');

      // Pass metrics should have LOWER accuracy sum than all metrics
      // (5 passes at 1.0 each = 5.0 total) < (5 passes at 1.0 + 5 failures at 0.2 = 6.0 total)
      expect(passMetrics[0].namedScores.accuracy).toBeLessThan(allMetrics[0].namedScores.accuracy);

      // But the pass metrics should have non-zero accuracy
      expect(passMetrics[0].namedScores.accuracy).toBeGreaterThan(0);
    });
  });
});
