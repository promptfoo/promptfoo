import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateEvaluationCache } from '../../src/models/evalMutation';
import {
  clearCountCache,
  getCachedResultsCount,
  getTotalResultRowCount,
} from '../../src/models/evalPerformance';

const databaseMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  runCountQuery: vi.fn(),
}));

vi.mock('../../src/database/index', () => ({
  getDb: databaseMocks.getDb,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('evalPerformance concurrent invalidation', () => {
  beforeEach(() => {
    clearCountCache();
    databaseMocks.getDb.mockReset().mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ all: databaseMocks.runCountQuery })),
        })),
      })),
    });
    databaseMocks.runCountQuery.mockReset();
  });

  afterEach(() => {
    clearCountCache();
    vi.resetAllMocks();
  });

  it.each([
    ['distinct count', getCachedResultsCount],
    ['total row count', getTotalResultRowCount],
  ])('does not cache an obsolete in-flight %s after centralized invalidation', async (_, count) => {
    const staleQuery = deferred<Array<{ count: number }>>();
    databaseMocks.runCountQuery
      .mockReturnValueOnce(staleQuery.promise)
      .mockResolvedValueOnce([{ count: 1 }]);

    const inFlightCount = count('eval-concurrent-invalidation');
    await vi.waitFor(() => expect(databaseMocks.runCountQuery).toHaveBeenCalledOnce());

    invalidateEvaluationCache('eval-concurrent-invalidation');
    staleQuery.resolve([{ count: 0 }]);

    expect(await inFlightCount).toBe(0);
    expect(await count('eval-concurrent-invalidation')).toBe(1);
    expect(databaseMocks.runCountQuery).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['scoped', (evalId: string) => invalidateEvaluationCache(evalId)],
    ['global', () => clearCountCache()],
  ])('invalidates every in-flight count query after a %s clear', async (_, invalidate) => {
    const staleDistinctQuery = deferred<Array<{ count: number }>>();
    const staleTotalQuery = deferred<Array<{ count: number }>>();
    databaseMocks.runCountQuery
      .mockReturnValueOnce(staleDistinctQuery.promise)
      .mockReturnValueOnce(staleTotalQuery.promise)
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 2 }]);

    const evalId = 'eval-overlapping-counts';
    const inFlightDistinctCount = getCachedResultsCount(evalId);
    const inFlightTotalCount = getTotalResultRowCount(evalId);
    await vi.waitFor(() => expect(databaseMocks.runCountQuery).toHaveBeenCalledTimes(2));

    invalidate(evalId);
    staleDistinctQuery.resolve([{ count: 0 }]);
    staleTotalQuery.resolve([{ count: 0 }]);

    await expect(Promise.all([inFlightDistinctCount, inFlightTotalCount])).resolves.toEqual([0, 0]);
    expect(await getCachedResultsCount(evalId)).toBe(1);
    expect(await getTotalResultRowCount(evalId)).toBe(2);
    expect(databaseMocks.runCountQuery).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['distinct count', getCachedResultsCount],
    ['total row count', getTotalResultRowCount],
  ])('keeps a valid in-flight %s when a different eval is invalidated', async (_, count) => {
    const currentQuery = deferred<Array<{ count: number }>>();
    databaseMocks.runCountQuery
      .mockReturnValueOnce(currentQuery.promise)
      .mockResolvedValueOnce([{ count: 1 }]);

    const inFlightCount = count('eval-still-current');
    await vi.waitFor(() => expect(databaseMocks.runCountQuery).toHaveBeenCalledOnce());

    invalidateEvaluationCache('different-eval');
    currentQuery.resolve([{ count: 0 }]);

    expect(await inFlightCount).toBe(0);
    expect(await count('eval-still-current')).toBe(0);
    expect(databaseMocks.runCountQuery).toHaveBeenCalledOnce();
  });
});
