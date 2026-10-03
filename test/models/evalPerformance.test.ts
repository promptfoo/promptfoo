import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import {
  clearCountCache,
  getCachedResultsCount,
  getCachedResultsCounts,
  getTotalResultRowCount,
} from '../../src/models/evalPerformance';
import { ResultFailureReason } from '../../src/types/index';
import { createEvaluateResult } from '../factories/eval';
import { createDeferred } from '../util/utils';

describe('evalPerformance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  describe('getCachedResultsCounts', () => {
    it('batches cold misses, deduplicates IDs, and reuses zero and nonzero counts', async () => {
      const first = await createEvalWithResults(2, 2);
      const second = await createEvalWithResults(1, 3);
      const unrelated = await createEvalWithResults(1, 1);
      const missingIds = Array.from({ length: 998 }, (_, i) => `missing-eval-${i}`);
      const ids = [first.eval_.id, ...missingIds, second.eval_.id];
      const db = await getDb();
      const execute = vi.spyOn(db.$client, 'execute');
      const asQuery = (query: string | { sql: string; args?: unknown }) =>
        typeof query === 'string' ? { sql: query, args: undefined } : query;
      const countQueries = () =>
        execute.mock.calls
          .map(([query]) => asQuery(query))
          .filter((query) => query.sql.includes('COUNT(DISTINCT test_idx)'));

      const counts = await getCachedResultsCounts([...ids, first.eval_.id]);
      expect(counts.size).toBe(1000);
      expect(counts.get(first.eval_.id)).toBe(2);
      expect(counts.get(second.eval_.id)).toBe(3);
      expect(counts.has(unrelated.eval_.id)).toBe(false);
      for (const id of missingIds) {
        expect(counts.get(id)).toBe(0);
      }
      expect(countQueries()).toHaveLength(2);
      expect(countQueries().map((query) => query.args)).toEqual([
        ids.slice(0, 999),
        ids.slice(999),
      ]);

      execute.mockClear();
      expect(await getCachedResultsCounts(ids)).toEqual(counts);
      expect(await getCachedResultsCount(first.eval_.id)).toBe(2);
      expect(await getCachedResultsCount(missingIds[0])).toBe(0);
      expect(countQueries()).toHaveLength(0);

      clearCountCache(second.eval_.id);
      expect(await getCachedResultsCounts(ids)).toEqual(counts);
      expect(countQueries()).toHaveLength(1);
      expect(countQueries().map((query) => query.args)).toEqual([[second.eval_.id]]);
    });

    it('does not query the database for an empty ID list', async () => {
      const db = await getDb();
      const execute = vi.spyOn(db.$client, 'execute');
      expect(await getCachedResultsCounts([])).toEqual(new Map());
      expect(execute).not.toHaveBeenCalled();
    });

    it.each(['scoped', 'global'])(
      'does not cache an older snapshot after %s invalidation while a read is pending',
      async (scope) => {
        const active = await createEvalWithResults(1, 1);
        const unrelated = await createEvalWithResults(1, 1);
        await getCachedResultsCount(unrelated.eval_.id);
        const db = await getDb();
        const execute = db.$client.execute.bind(db.$client);
        const started = createDeferred<void>();
        const released = createDeferred<void>();
        let paused = false;
        const isCountQuery = (query: string | { sql: string }) =>
          (typeof query === 'string' ? query : query.sql).includes('COUNT(DISTINCT test_idx)');
        const spy = vi.spyOn(db.$client, 'execute').mockImplementation(async (query, args) => {
          const result = await execute(query, args);
          if (!paused && isCountQuery(query)) {
            paused = true;
            started.resolve();
            await released.promise;
          }
          return result;
        });
        const pending = getCachedResultsCounts([active.eval_.id, unrelated.eval_.id]);
        try {
          await started.promise;
          await active.eval_.addResult(createEvaluateResult({ testIdx: 1 }));
          clearCountCache(scope === 'scoped' ? active.eval_.id : undefined);
          released.resolve();
          expect((await pending).get(active.eval_.id)).toBe(1);

          spy.mockClear();
          const fresh = await getCachedResultsCounts([active.eval_.id, unrelated.eval_.id]);
          expect(fresh.get(active.eval_.id)).toBe(2);
          expect(fresh.get(unrelated.eval_.id)).toBe(1);
          const expectedIds =
            scope === 'scoped' ? [active.eval_.id] : [active.eval_.id, unrelated.eval_.id];
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: expectedIds }));
        } finally {
          released.resolve();
          await pending;
        }
      },
    );

    it.each(['older-first', 'newer-first', 'older-error'])(
      'preserves the newer pending read and cache fill (%s)',
      async (order) => {
        const { eval_ } = await createEvalWithResults(1, 1);
        const db = await getDb();
        const execute = db.$client.execute.bind(db.$client);
        const started = [createDeferred<void>(), createDeferred<void>()];
        const released = [createDeferred<void>(), createDeferred<void>()];
        let reads = 0;
        const isCountQuery = (query: string | { sql: string }) =>
          (typeof query === 'string' ? query : query.sql).includes('COUNT(DISTINCT test_idx)');
        const spy = vi.spyOn(db.$client, 'execute').mockImplementation(async (query, args) => {
          const result = await execute(query, args);
          if (isCountQuery(query) && reads < 2) {
            const index = reads++;
            started[index].resolve();
            await released[index].promise;
            if (order === 'older-error' && index === 0) {
              throw new Error('Synthetic count response failure');
            }
          }
          return result;
        });
        const older = getCachedResultsCount(eval_.id).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        let newer: Promise<number> | undefined;
        try {
          await started[0].promise;
          await eval_.addResult(createEvaluateResult({ testIdx: 1 }));
          newer = getCachedResultsCount(eval_.id);
          await started[1].promise;
          if (order === 'newer-first') {
            released[1].resolve();
            expect(await newer).toBe(2);
          }
          released[0].resolve();
          expect(await older).toEqual(
            order === 'older-error' ? { error: expect.any(Error) } : { value: 1 },
          );
          released[1].resolve();
          expect(await newer).toBe(2);

          spy.mockClear();
          expect(await getCachedResultsCount(eval_.id)).toBe(2);
          expect(spy).not.toHaveBeenCalled();
        } finally {
          released.forEach((gate) => gate.resolve());
          await Promise.allSettled([older, newer]);
        }
      },
    );

    it('refreshes expired entries together using the existing five-minute TTL', async () => {
      const first = await createEvalWithResults(1, 1);
      const second = await createEvalWithResults(1, 2);
      const ids = [first.eval_.id, second.eval_.id];
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      const counts = await getCachedResultsCounts(ids);
      const db = await getDb();
      const execute = vi.spyOn(db.$client, 'execute');

      clock.mockReturnValue(now + 5 * 60 * 1000 - 1);
      expect(await getCachedResultsCounts(ids)).toEqual(counts);
      expect(execute).not.toHaveBeenCalled();

      clock.mockReturnValue(now + 5 * 60 * 1000);
      expect(await getCachedResultsCounts(ids)).toEqual(counts);
      expect(execute).toHaveBeenCalledTimes(1);
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

  describe('cache invalidation on result write (issue #9348)', () => {
    const makeResult = (_evalId: string, testIdx: number) =>
      ({
        description: `test-${testIdx}`,
        promptIdx: 0,
        testIdx,
        testCase: { vars: { input: `test${testIdx}` } },
        promptId: 'test-prompt',
        provider: { id: 'provider-1', label: 'Provider 1' },
        prompt: { raw: 'Test prompt', label: 'Test prompt' },
        vars: { input: `test${testIdx}` },
        response: {
          output: `response-${testIdx}`,
          tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.NONE,
        success: true,
        score: 1,
        latencyMs: 10,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Pass',
          namedScores: {},
          tokensUsed: { total: 0, prompt: 0, completion: 0, cached: 0 },
          componentResults: [],
        },
        namedScores: {},
        cost: 0,
        metadata: {},
      }) as Parameters<
        typeof import('../../src/models/evalResult')['default']['createFromEvaluateResult']
      >[1];

    it('getCachedResultsCount refreshes after createFromEvaluateResult (issue #9348)', async () => {
      const eval_ = await Eval.create(
        { providers: [{ id: 'provider-1' }], prompts: ['Test prompt'], tests: [] },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      // Seed zero into cache before any inserts
      const before = await getCachedResultsCount(eval_.id);
      expect(before).toBe(0);

      // Insert a result — this should bust the cache automatically
      await eval_.addResult(makeResult(eval_.id, 0));

      // Must see fresh count without any manual clearCountCache() call
      const after = await getCachedResultsCount(eval_.id);
      expect(after).toBe(1);
    });

    it('getTotalResultRowCount refreshes after createFromEvaluateResult (issue #9348)', async () => {
      const eval_ = await Eval.create(
        { providers: [{ id: 'provider-1' }], prompts: ['Test prompt'], tests: [] },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      const before = await getTotalResultRowCount(eval_.id);
      expect(before).toBe(0);

      await eval_.addResult(makeResult(eval_.id, 0));

      const after = await getTotalResultRowCount(eval_.id);
      expect(after).toBe(1);
    });

    it('getCachedResultsCount refreshes after createManyFromEvaluateResult (issue #9348)', async () => {
      const eval_ = await Eval.create(
        { providers: [{ id: 'provider-1' }], prompts: ['Test prompt'], tests: [] },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      const before = await getCachedResultsCount(eval_.id);
      expect(before).toBe(0);

      const EvalResult = (await import('../../src/models/evalResult')).default;
      await EvalResult.createManyFromEvaluateResult(
        [makeResult(eval_.id, 0), makeResult(eval_.id, 1)] as any,
        eval_.id,
      );

      const after = await getCachedResultsCount(eval_.id);
      expect(after).toBe(2);
    });
  });
});
