import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import {
  clearCountCache,
  getCachedResultsCount,
  getTotalResultRowCount,
} from '../../src/models/evalPerformance';
import { ResultFailureReason } from '../../src/types/index';

describe('evalPerformance', () => {
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
    clearCountCache();
  });

  /**
   * Helper to create an eval and add results for provider x test combinations.
   * Returns the eval and the expected counts.
   */
  async function createEvalWithResults(numProviders: number, numTests: number) {
    const providers = Array.from({ length: numProviders }, (_, i) => ({ id: `provider-${i + 1}` }));
    const tests = Array.from({ length: numTests }, (_, i) => ({ vars: { input: `test${i + 1}` } }));

    const eval_ = await Eval.create(
      {
        providers,
        prompts: ['Test prompt'],
        tests,
      },
      [{ raw: 'Test prompt', label: 'Test prompt' }],
    );

    // Add results for each provider × test combination
    for (let providerIdx = 0; providerIdx < numProviders; providerIdx++) {
      for (let testIdx = 0; testIdx < numTests; testIdx++) {
        await eval_.addResult({
          description: `test-${providerIdx}-${testIdx}`,
          promptIdx: 0,
          testIdx,
          testCase: { vars: { input: `test${testIdx + 1}` } },
          promptId: 'test-prompt',
          provider: { id: `provider-${providerIdx + 1}`, label: `Provider ${providerIdx + 1}` },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { input: `test${testIdx + 1}` },
          response: {
            output: `response-${providerIdx}-${testIdx}`,
            tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Pass',
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5, cached: 0 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.001,
          metadata: {},
        });
      }
    }

    return {
      eval_,
      expectedDistinctCount: numTests,
      expectedTotalRowCount: numProviders * numTests,
    };
  }

  describe('getCachedResultsCount', () => {
    it('should count distinct test indices (unique test cases)', async () => {
      // Create an eval with 2 providers and 3 test cases
      // This should produce 6 total results (2 providers × 3 tests)
      // But only 3 distinct test indices
      const { eval_, expectedDistinctCount } = await createEvalWithResults(2, 3);

      // Should return 3 (distinct test indices), not 6 (total rows)
      const count = await getCachedResultsCount(eval_.id);
      expect(count).toBe(expectedDistinctCount);
    });

    it('should return 0 for an eval with no results', async () => {
      const eval_ = await Eval.create(
        {
          providers: [{ id: 'provider-1' }],
          prompts: ['Test prompt'],
          tests: [{ vars: { input: 'test1' } }],
        },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      const count = await getCachedResultsCount(eval_.id);
      expect(count).toBe(0);
    });

    it('should cache the count result', async () => {
      const { eval_ } = await createEvalWithResults(1, 1);

      // First call should hit the database
      const count1 = await getCachedResultsCount(eval_.id);
      expect(count1).toBe(1);

      // Second call should return cached result
      const count2 = await getCachedResultsCount(eval_.id);
      expect(count2).toBe(1);

      // Clear cache and verify we can get fresh count
      clearCountCache(eval_.id);
      const count3 = await getCachedResultsCount(eval_.id);
      expect(count3).toBe(1);
    });
  });

  describe('getTotalResultRowCount', () => {
    it('should count all result rows (including multiple per test)', async () => {
      // Create an eval with 2 providers and 3 test cases
      // This should produce 6 total result rows (2 providers × 3 tests)
      const { eval_, expectedTotalRowCount } = await createEvalWithResults(2, 3);

      // Should return 6 (total rows), not 3 (distinct test indices)
      const count = await getTotalResultRowCount(eval_.id);
      expect(count).toBe(expectedTotalRowCount);
    });

    it('should return 0 for an eval with no results', async () => {
      const eval_ = await Eval.create(
        {
          providers: [{ id: 'provider-1' }],
          prompts: ['Test prompt'],
          tests: [{ vars: { input: 'test1' } }],
        },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      const count = await getTotalResultRowCount(eval_.id);
      expect(count).toBe(0);
    });

    it('should cache the count result', async () => {
      const { eval_ } = await createEvalWithResults(1, 1);

      // First call should hit the database
      const count1 = await getTotalResultRowCount(eval_.id);
      expect(count1).toBe(1);

      // Second call should return cached result
      const count2 = await getTotalResultRowCount(eval_.id);
      expect(count2).toBe(1);

      // Clear cache and verify we can get fresh count
      clearCountCache(eval_.id);
      const count3 = await getTotalResultRowCount(eval_.id);
      expect(count3).toBe(1);
    });
  });

  describe('count functions comparison', () => {
    it('should return same count when 1 provider per test', async () => {
      const { eval_ } = await createEvalWithResults(1, 5);

      const distinctCount = await getCachedResultsCount(eval_.id);
      const totalCount = await getTotalResultRowCount(eval_.id);

      // With 1 provider, distinct count equals total count
      expect(distinctCount).toBe(5);
      expect(totalCount).toBe(5);
    });

    it('should return different counts when multiple providers per test', async () => {
      const { eval_ } = await createEvalWithResults(3, 4);

      const distinctCount = await getCachedResultsCount(eval_.id);
      const totalCount = await getTotalResultRowCount(eval_.id);

      // With 3 providers and 4 tests:
      // - distinct count = 4 (unique test indices)
      // - total count = 12 (3 providers × 4 tests)
      expect(distinctCount).toBe(4);
      expect(totalCount).toBe(12);
    });
  });
});
