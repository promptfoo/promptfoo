/**
 * Integration tests for GET /api/eval/:id/table with filtered metrics.
 *
 * Tests that the API route correctly:
 * 1. Detects active filters
 * 2. Calls getFilteredMetrics when appropriate
 * 3. Includes filteredMetrics in the response
 * 4. Handles errors gracefully
 */

import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../../src/database/index';
import { runDbMigrations } from '../../../src/migrate';
import { createApp } from '../../../src/server/server';
import EvalFactory from '../../factories/evalFactory';

describe('GET /api/eval/:id/table - Filtered Metrics Integration', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    app = createApp();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');

    // Reset mocks
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Filtered metrics behavior', () => {
    it('should include filteredMetrics when filters are active', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'errors' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('filteredMetrics');
      expect(response.body.filteredMetrics).not.toBeNull();
      expect(Array.isArray(response.body.filteredMetrics)).toBe(true);
      expect(response.body.filteredMetrics).toHaveLength(1); // 1 prompt

      // Verify structure
      expect(response.body.filteredMetrics[0]).toMatchObject({
        score: expect.any(Number),
        testPassCount: expect.any(Number),
        testFailCount: expect.any(Number),
        testErrorCount: expect.any(Number),
        assertPassCount: expect.any(Number),
        assertFailCount: expect.any(Number),
        totalLatencyMs: expect.any(Number),
        tokenUsage: expect.any(Object),
        namedScores: expect.any(Object),
        namedScoresCount: expect.any(Object),
        cost: expect.any(Number),
      });
    });

    it('should NOT include filteredMetrics when NO filters are active', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'all' }); // No filters

      expect(response.status).toBe(200);
      expect(response.body.filteredMetrics).toBeNull();
    });
  });

  describe('Filter detection', () => {
    it('should detect filterMode as active filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'passes' });

      expect(response.status).toBe(200);
      expect(response.body.filteredMetrics).not.toBeNull();
    });

    it('should detect searchQuery as active filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
        searchableContent: 'searchable',
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ search: 'searchable' });

      expect(response.status).toBe(200);
      expect(response.body.filteredMetrics).not.toBeNull();
    });

    it('should detect custom filters as active', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
        withNamedScores: true,
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({
          filter: JSON.stringify({
            logicOperator: 'and',
            type: 'metric',
            operator: 'equals',
            value: 'accuracy',
          }),
        });

      expect(response.status).toBe(200);
      expect(response.body.filteredMetrics).not.toBeNull();
    });

    it('should detect multiple filters as active', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
        withNamedScores: true,
        searchableContent: 'searchable',
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({
          filterMode: 'failures',
          search: 'searchable',
          filter: JSON.stringify({
            logicOperator: 'and',
            type: 'metric',
            operator: 'equals',
            value: 'accuracy',
          }),
        });

      expect(response.status).toBe(200);
      expect(response.body.filteredMetrics).not.toBeNull();
    });
  });

  describe('Metrics correctness', () => {
    it('should return correct metrics for error filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 15,
        resultTypes: ['success', 'error', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'errors' });

      expect(response.status).toBe(200);
      expect(response.body.filteredMetrics).not.toBeNull();

      const metrics = response.body.filteredMetrics[0];
      expect(metrics.testErrorCount).toBeGreaterThan(0);
      expect(metrics.testPassCount).toBe(0);
      expect(metrics.testFailCount).toBe(0);
    });

    it('should return correct metrics for failure filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 15,
        resultTypes: ['success', 'error', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'failures' });

      expect(response.status).toBe(200);
      expect(response.body.filteredMetrics).not.toBeNull();

      const metrics = response.body.filteredMetrics[0];
      expect(metrics.testFailCount).toBeGreaterThan(0);
      expect(metrics.testPassCount).toBe(0);
      expect(metrics.testErrorCount).toBe(0);
    });

    it('should return correct metrics for pass filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 15,
        resultTypes: ['success', 'error', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'passes' });

      expect(response.status).toBe(200);
      expect(response.body.filteredMetrics).not.toBeNull();

      const metrics = response.body.filteredMetrics[0];
      expect(metrics.testPassCount).toBeGreaterThan(0);
      expect(metrics.testFailCount).toBe(0);
      expect(metrics.testErrorCount).toBe(0);
    });

    it('should return metrics with named scores when present', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
        withNamedScores: true,
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'passes' });

      expect(response.status).toBe(200);
      expect(response.body.filteredMetrics).not.toBeNull();

      const metrics = response.body.filteredMetrics[0];
      expect(metrics.namedScores).toHaveProperty('accuracy');
      expect(metrics.namedScores).toHaveProperty('relevance');
      expect(metrics.namedScoresCount).toHaveProperty('accuracy');
      expect(metrics.namedScoresCount).toHaveProperty('relevance');
    });
  });

  describe('Error handling', () => {
    it('should handle nonexistent eval gracefully', async () => {
      const response = await request(app)
        .get('/api/eval/nonexistent-id/table')
        .query({ filterMode: 'errors' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should return empty metrics when no results match filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
      });

      // Delete all results to test empty dataset handling
      const db = getDb();
      await db.run(`DELETE FROM eval_results WHERE eval_id = '${eval_.id}'`);

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'errors' });

      // Request should still succeed
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('table');

      // filteredMetrics should be empty array (not null) for zero results
      expect(response.body.filteredMetrics).not.toBeNull();
      expect(Array.isArray(response.body.filteredMetrics)).toBe(true);
      expect(response.body.filteredMetrics[0]).toMatchObject({
        score: 0,
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 0,
      });
    });

    it('should validate filteredMetrics array length matches prompts array length', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'errors' });

      expect(response.status).toBe(200);

      // If filteredMetrics is not null, it must have the same length as prompts
      if (response.body.filteredMetrics !== null) {
        expect(response.body.filteredMetrics.length).toBe(response.body.table.head.prompts.length);
      }
    });
  });

  describe('Response structure', () => {
    it('should include all required fields in response', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'errors' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        table: expect.any(Object),
        totalCount: expect.any(Number),
        filteredCount: expect.any(Number),
        filteredMetrics: expect.any(Array),
        config: expect.any(Object),
        author: null, // or expect.any(String) if author is set
        version: expect.any(Number),
        id: eval_.id,
      });
    });

    it('should preserve existing behavior for export formats', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
      });

      // CSV export should not include filteredMetrics
      const csvResponse = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ format: 'csv', filterMode: 'errors' });

      expect(csvResponse.status).toBe(200);
      expect(csvResponse.headers['content-type']).toContain('text/csv');
      expect(typeof csvResponse.text).toBe('string');

      // JSON export should not include filteredMetrics (returns table object, not array)
      const jsonResponse = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ format: 'json', filterMode: 'errors' });

      expect(jsonResponse.status).toBe(200);
      expect(jsonResponse.headers['content-type']).toContain('application/json');
      // JSON export returns table structure { head, body }, not full EvalTableDTO
      expect(jsonResponse.body).toHaveProperty('head');
      expect(jsonResponse.body).toHaveProperty('body');
      expect(jsonResponse.body).not.toHaveProperty('filteredMetrics');
    });
  });

  describe('Pagination interaction', () => {
    it('should calculate metrics for entire filtered dataset, not just current page', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 100,
        resultTypes: ['success', 'error', 'failure'],
      });

      // Request first page (limited results)
      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ filterMode: 'passes', limit: 10, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.table.body).toHaveLength(10); // Paginated results

      // But filteredMetrics should cover ALL passes, not just the 10 on this page
      const metrics = response.body.filteredMetrics[0];
      expect(metrics.testPassCount).toBeGreaterThan(10);
    });
  });

  describe('Comparison mode', () => {
    it('should include filteredMetrics for base eval even when comparison evals are present', async () => {
      const eval1 = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
      });

      const eval2 = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
      });

      const response = await request(app).get(`/api/eval/${eval1.id}/table`).query({
        filterMode: 'passes',
        comparisonEvalIds: eval2.id,
      });

      expect(response.status).toBe(200);

      // filteredMetrics should be calculated for the base eval (eval1)
      // even when comparison evals are included in the table
      expect(response.body).toHaveProperty('filteredMetrics');
      expect(response.body.filteredMetrics).not.toBeNull();
      expect(Array.isArray(response.body.filteredMetrics)).toBe(true);

      // filteredMetrics should match the base eval's prompt count (1), not the combined count (2)
      expect(response.body.filteredMetrics).toHaveLength(1);

      // Verify the table includes both base and comparison prompts
      expect(response.body.table.head.prompts.length).toBeGreaterThan(1);
    });
  });
});
