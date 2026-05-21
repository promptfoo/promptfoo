/**
 * Integration tests for bulk rating API endpoints.
 *
 * Tests the POST /:evalId/results/bulk-rating and
 * GET /:evalId/results/bulk-rating/preview endpoints.
 */

import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../../src/database/index';
import { runDbMigrations } from '../../../src/migrate';
import { createApp } from '../../../src/server/server';
import { evalLockManager } from '../../../src/services/bulkGrade/lock';
import EvalFactory from '../../factories/evalFactory';

describe('Bulk Rating API Endpoints', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    app = createApp();
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /:evalId/results/bulk-rating', () => {
    describe('successful operations', () => {
      it('should bulk rate results as pass', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: true,
          reason: 'Approved in bulk',
          filterMode: 'all',
        });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.matched).toBe(5);
        expect(response.body.updated).toBe(5);
      });

      it('should bulk rate results as fail', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['success'],
        });

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: false,
          reason: 'Rejected in bulk',
          filterMode: 'all',
        });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.updated).toBe(5);
      });

      it('should apply filter mode correctly', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 10,
          resultTypes: ['success', 'failure'],
        });

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: true,
          reason: 'Approved failures only',
          filterMode: 'failures',
        });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.matched).toBe(5);
      });

      it('should skip already rated results', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['success'],
        });

        // First rating
        await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: true,
          reason: 'Same reason',
          filterMode: 'all',
        });

        // Second rating with same values
        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: true,
          reason: 'Same reason',
          filterMode: 'all',
        });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.skipped).toBe(5);
        expect(response.body.updated).toBe(0);
      });
    });

    describe('validation errors', () => {
      it('should return 400 for missing pass field', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          reason: 'Test',
          filterMode: 'all',
        });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Invalid request');
      });

      it('should return 400 for missing reason field', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: true,
          filterMode: 'all',
        });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should return 400 for invalid filterMode', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: true,
          reason: 'Test',
          filterMode: 'invalid-mode',
        });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should return 400 for reason exceeding max length', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        const longReason = 'x'.repeat(10001);

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: true,
          reason: longReason,
          filterMode: 'all',
        });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('confirmation threshold', () => {
      it('should return 400 when confirmation required but not provided', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 60,
          resultTypes: ['failure'],
        });

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: true,
          reason: 'Bulk approve',
          filterMode: 'all',
        });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('confirmBulk');
      });

      it('should succeed when confirmation is provided', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 60,
          resultTypes: ['failure'],
        });

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: true,
          reason: 'Bulk approve',
          filterMode: 'all',
          confirmBulk: true,
        });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.updated).toBe(60);
      });
    });

    describe('error responses', () => {
      it('should return 404 for non-existent eval', async () => {
        const response = await request(app)
          .post('/api/eval/non-existent-eval/results/bulk-rating')
          .send({
            pass: true,
            reason: 'Test',
            filterMode: 'all',
          });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Eval not found');
      });

      it('should return 409 when concurrent operation in progress', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        // Manually acquire lock
        evalLockManager.acquire(eval_.id, 'existing-operation');

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: true,
          reason: 'Test',
          filterMode: 'all',
        });

        expect(response.status).toBe(409);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('in progress');

        // Clean up
        evalLockManager.release(eval_.id);
      });
    });

    describe('filter modes', () => {
      it('should handle passes filterMode', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 10,
          resultTypes: ['success', 'failure'],
        });

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: false,
          reason: 'Rejecting passes',
          filterMode: 'passes',
        });

        expect(response.status).toBe(200);
        expect(response.body.matched).toBe(5);
      });

      it('should handle errors filterMode', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 9,
          resultTypes: ['success', 'failure', 'error'],
        });

        const response = await request(app).post(`/api/eval/${eval_.id}/results/bulk-rating`).send({
          pass: false,
          reason: 'Marking errors as failed',
          filterMode: 'errors',
        });

        expect(response.status).toBe(200);
        expect(response.body.matched).toBe(3);
      });
    });
  });

  describe('GET /:evalId/results/bulk-rating/preview', () => {
    it('should return count of matching results', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/results/bulk-rating/preview`)
        .query({ filterMode: 'failures' });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(5);
    });

    it('should return total count for all filterMode', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/results/bulk-rating/preview`)
        .query({ filterMode: 'all' });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(10);
    });

    it('should return 0 for non-existent eval', async () => {
      const response = await request(app)
        .get('/api/eval/non-existent-eval/results/bulk-rating/preview')
        .query({ filterMode: 'all' });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
    });

    it('should return 400 for invalid filterMode', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 5,
        resultTypes: ['success'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/results/bulk-rating/preview`)
        .query({ filterMode: 'invalid-mode' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid filterMode');
    });

    it('should handle errors filterMode', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 9,
        resultTypes: ['success', 'failure', 'error'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/results/bulk-rating/preview`)
        .query({ filterMode: 'errors' });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(3);
    });

    it('should handle passes filterMode', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/results/bulk-rating/preview`)
        .query({ filterMode: 'passes' });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(5);
    });

    it('should handle searchQuery parameter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
        searchableContent: 'findme',
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/results/bulk-rating/preview`)
        .query({
          filterMode: 'all',
          searchQuery: 'findme',
        });

      expect(response.status).toBe(200);
      // Some results should match the search
      expect(response.body.count).toBeGreaterThan(0);
    });

    it('should handle filters parameter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
        withNamedScores: true,
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/results/bulk-rating/preview`)
        .query({
          filterMode: 'all',
          filters: JSON.stringify([
            JSON.stringify({
              logicOperator: 'AND',
              type: 'metric',
              operator: 'equals',
              value: 'accuracy',
            }),
          ]),
        });

      expect(response.status).toBe(200);
      expect(typeof response.body.count).toBe('number');
    });

    it('should return 400 for invalid filters JSON', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 5,
        resultTypes: ['success'],
      });

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/results/bulk-rating/preview`)
        .query({
          filterMode: 'all',
          filters: 'not-valid-json',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid filters');
    });
  });
});
