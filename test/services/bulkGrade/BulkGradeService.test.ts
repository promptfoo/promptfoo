/**
 * Unit tests for BulkGradeService
 *
 * Tests the bulk grading/rating service that applies pass/fail overrides
 * to multiple eval results at once.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../../src/database/index';
import { runDbMigrations } from '../../../src/migrate';
import Eval from '../../../src/models/eval';
import EvalResult from '../../../src/models/evalResult';
import { BULK_RATING_CONSTANTS, bulkGradeService } from '../../../src/services/bulkGrade';
import { evalLockManager } from '../../../src/services/bulkGrade/lock';
import EvalFactory from '../../factories/evalFactory';

describe('BulkGradeService', () => {
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
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('bulkManualRating', () => {
    describe('basic functionality', () => {
      it('should rate all results as pass', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Approved in bulk',
          filterMode: 'all',
        });

        expect(result.success).toBe(true);
        expect(result.matched).toBe(5);
        expect(result.updated).toBe(5);
        expect(result.skipped).toBe(0);

        // Verify results are now passing
        const results = await EvalResult.findManyByEvalId(eval_.id);
        for (const r of results) {
          expect(r.success).toBe(true);
          expect(r.score).toBe(1);
          expect(r.gradingResult?.pass).toBe(true);
          expect(r.gradingResult?.reason).toBe('Approved in bulk');
        }
      });

      it('should rate all results as fail', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['success'],
        });

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: false,
          reason: 'Rejected in bulk',
          filterMode: 'all',
        });

        expect(result.success).toBe(true);
        expect(result.matched).toBe(5);
        expect(result.updated).toBe(5);

        // Verify results are now failing
        const results = await EvalResult.findManyByEvalId(eval_.id);
        for (const r of results) {
          expect(r.success).toBe(false);
          expect(r.score).toBe(0);
          expect(r.gradingResult?.pass).toBe(false);
        }
      });

      it('should skip results that already have the same rating', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['success'],
        });

        // First rating
        await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Same reason',
          filterMode: 'all',
        });

        // Second rating with same pass/reason
        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Same reason',
          filterMode: 'all',
        });

        expect(result.success).toBe(true);
        expect(result.skipped).toBe(5);
        expect(result.updated).toBe(0);
      });
    });

    describe('filtering', () => {
      it('should only rate failures when filterMode is failures', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 10,
          resultTypes: ['success', 'failure'],
        });

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Approved failures',
          filterMode: 'failures',
        });

        expect(result.success).toBe(true);
        expect(result.matched).toBe(5); // Half are failures
        expect(result.updated).toBe(5);
      });

      it('should only rate passes when filterMode is passes', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 10,
          resultTypes: ['success', 'failure'],
        });

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: false,
          reason: 'Rejected passes',
          filterMode: 'passes',
        });

        expect(result.success).toBe(true);
        expect(result.matched).toBe(5); // Half are passes
        expect(result.updated).toBe(5);
      });

      it('should only rate errors when filterMode is errors', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 9,
          resultTypes: ['success', 'failure', 'error'],
        });

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: false,
          reason: 'Marked errors as failed',
          filterMode: 'errors',
        });

        expect(result.success).toBe(true);
        expect(result.matched).toBe(3); // 1/3 are errors
      });
    });

    describe('confirmation threshold', () => {
      it('should require confirmation for large bulk operations', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 60,
          resultTypes: ['failure'],
        });

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Bulk approve',
          filterMode: 'all',
          confirmBulk: false,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Set confirmBulk: true');
        expect(result.matched).toBe(60);
      });

      it('should proceed when confirmation is provided', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 60,
          resultTypes: ['failure'],
        });

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Bulk approve',
          filterMode: 'all',
          confirmBulk: true,
        });

        expect(result.success).toBe(true);
        expect(result.updated).toBe(60);
      });

      it('should not require confirmation below threshold', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 49,
          resultTypes: ['failure'],
        });

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Bulk approve',
          filterMode: 'all',
        });

        expect(result.success).toBe(true);
        expect(result.updated).toBe(49);
      });
    });

    describe('validation', () => {
      it('should reject reason exceeding max length', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        const longReason = 'x'.repeat(BULK_RATING_CONSTANTS.MAX_REASON_LENGTH + 1);

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: longReason,
          filterMode: 'all',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('maximum length');
      });

      it('should return error for non-existent eval', async () => {
        const result = await bulkGradeService.bulkManualRating('non-existent-eval', {
          pass: true,
          reason: 'Test',
          filterMode: 'all',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Eval not found');
      });
    });

    describe('locking', () => {
      it('should prevent concurrent bulk operations on same eval', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        // Manually acquire lock to simulate concurrent operation
        evalLockManager.acquire(eval_.id, 'existing-operation');

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Test',
          filterMode: 'all',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('in progress');

        // Clean up
        evalLockManager.release(eval_.id);
      });

      it('should release lock after successful operation', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Test',
          filterMode: 'all',
        });

        expect(evalLockManager.isLocked(eval_.id)).toBe(false);
      });

      it('should release lock after failed operation', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        // Trigger failure with long reason
        const longReason = 'x'.repeat(BULK_RATING_CONSTANTS.MAX_REASON_LENGTH + 1);

        await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: longReason,
          filterMode: 'all',
        });

        // Lock should be released even after failure
        // Note: validation error happens before lock is acquired
        expect(evalLockManager.isLocked(eval_.id)).toBe(false);
      });
    });

    describe('metric updates', () => {
      it('should update prompt metrics when changing pass/fail state', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        // Get initial metrics
        const beforeEval = await Eval.findById(eval_.id);
        const beforeMetrics = beforeEval?.prompts[0]?.metrics;

        await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Approved',
          filterMode: 'all',
        });

        // Get updated metrics
        const afterEval = await Eval.findById(eval_.id);
        const afterMetrics = afterEval?.prompts[0]?.metrics;

        // Pass count should increase, fail count should decrease
        expect(afterMetrics?.testPassCount).toBeGreaterThan(beforeMetrics?.testPassCount ?? 0);
      });

      it('should update score delta correctly', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 5,
          resultTypes: ['failure'],
        });

        const beforeEval = await Eval.findById(eval_.id);
        const beforeScore = beforeEval?.prompts[0]?.metrics?.score ?? 0;

        await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Approved',
          filterMode: 'all',
        });

        const afterEval = await Eval.findById(eval_.id);
        const afterScore = afterEval?.prompts[0]?.metrics?.score ?? 0;

        // Score should increase when changing failures to passes
        expect(afterScore).toBeGreaterThan(beforeScore);
      });
    });

    describe('edge cases', () => {
      it('should handle empty results', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 0,
        });

        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Test',
          filterMode: 'all',
        });

        expect(result.success).toBe(true);
        expect(result.matched).toBe(0);
        expect(result.updated).toBe(0);
      });

      it('should handle no matching results', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 10,
          resultTypes: ['success'],
        });

        // Try to rate failures when there are none
        const result = await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Test',
          filterMode: 'failures',
        });

        expect(result.success).toBe(true);
        expect(result.matched).toBe(0);
        expect(result.updated).toBe(0);
      });

      it('should preserve existing component results when adding human rating', async () => {
        const eval_ = await EvalFactory.create({
          numResults: 1,
          resultTypes: ['failure'],
        });

        await bulkGradeService.bulkManualRating(eval_.id, {
          pass: true,
          reason: 'Approved',
          filterMode: 'all',
        });

        const results = await EvalResult.findManyByEvalId(eval_.id);
        const gradingResult = results[0].gradingResult;

        // Should have both original assertion and human rating
        expect(gradingResult?.componentResults?.length).toBeGreaterThanOrEqual(1);

        // Should have human assertion
        const humanAssertion = gradingResult?.componentResults?.find(
          (r) => r.assertion?.type === 'human',
        );
        expect(humanAssertion).toBeDefined();
        expect(humanAssertion?.pass).toBe(true);
        expect(humanAssertion?.reason).toBe('Approved');
      });
    });
  });

  describe('getFilteredResultsCount', () => {
    it('should return count of matching results', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const count = await bulkGradeService.getFilteredResultsCount(eval_.id, 'failures');

      expect(count).toBe(5);
    });

    it('should return 0 for non-existent eval', async () => {
      const count = await bulkGradeService.getFilteredResultsCount('non-existent-eval', 'all');

      expect(count).toBe(0);
    });

    it('should return total count for all filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const count = await bulkGradeService.getFilteredResultsCount(eval_.id, 'all');

      expect(count).toBe(10);
    });
  });
});
