import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { clearCountCache, getCachedResultsCount } from '../../src/models/evalPerformance';
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

  describe('getCachedResultsCount', () => {
    it('should count all result rows, not distinct test indices', async () => {
      // Create an eval with 2 providers and 3 test cases
      // This should produce 6 total results (2 providers × 3 tests)
      const eval_ = await Eval.create(
        {
          providers: [{ id: 'provider-1' }, { id: 'provider-2' }],
          prompts: ['Test prompt'],
          tests: [
            { vars: { input: 'test1' } },
            { vars: { input: 'test2' } },
            { vars: { input: 'test3' } },
          ],
        },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      // Add results for each provider × test combination
      for (let providerIdx = 0; providerIdx < 2; providerIdx++) {
        for (let testIdx = 0; testIdx < 3; testIdx++) {
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

      // Should return 6 (total rows), not 3 (distinct test indices)
      const count = await getCachedResultsCount(eval_.id);
      expect(count).toBe(6);
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
      const eval_ = await Eval.create(
        {
          providers: [{ id: 'provider-1' }],
          prompts: ['Test prompt'],
          tests: [{ vars: { input: 'test1' } }],
        },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      await eval_.addResult({
        description: 'test',
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { input: 'test1' } },
        promptId: 'test-prompt',
        provider: { id: 'provider-1', label: 'Provider 1' },
        prompt: { raw: 'Test prompt', label: 'Test prompt' },
        vars: { input: 'test1' },
        response: {
          output: 'response',
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
});
