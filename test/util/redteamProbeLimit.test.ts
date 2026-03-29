import { randomUUID } from 'crypto';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { evalResultsTable, evalsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import {
  checkRedteamProbeLimit,
  getMonthlyRedteamProbeUsage,
  getMonthStartTimestamp,
  MONTHLY_PROBE_LIMIT,
} from '../../src/util/redteamProbeLimit';

vi.mock('../../src/globalConfig/accounts', async () => {
  const actual = await vi.importActual('../../src/globalConfig/accounts');
  return {
    ...actual,
    isLoggedIntoCloud: vi.fn().mockReturnValue(false),
    getUserEmail: vi.fn().mockReturnValue('test@example.com'),
  };
});

/**
 * Helper to insert a redteam eval with result rows directly into the database.
 */
function insertRedteamEval(opts: {
  createdAt?: number;
  numResults?: number;
  numRequestsPerResult?: number;
}): string {
  const db = getDb();
  const evalId = randomUUID();
  const createdAt = opts.createdAt ?? Date.now();
  const numResults = opts.numResults ?? 1;
  const numRequestsPerResult = opts.numRequestsPerResult ?? 1;

  db.insert(evalsTable)
    .values({
      id: evalId,
      createdAt,
      config: { redteam: { plugins: [], strategies: [] } } as any,
      results: {},
      isRedteam: true,
    })
    .run();

  for (let i = 0; i < numResults; i++) {
    db.insert(evalResultsTable)
      .values({
        id: randomUUID(),
        createdAt,
        updatedAt: createdAt,
        evalId,
        promptIdx: 0,
        testIdx: i,
        testCase: { vars: {} },
        prompt: { raw: 'test', label: 'test' },
        provider: { id: 'test-provider' },
        response: {
          output: 'test output',
          tokenUsage: {
            total: 10,
            prompt: 5,
            completion: 5,
            numRequests: numRequestsPerResult,
          },
        },
        success: true,
        score: 1,
      })
      .run();
  }

  return evalId;
}

/**
 * Helper to insert a non-redteam eval.
 */
function insertNonRedteamEval(opts?: { createdAt?: number; numResults?: number }): string {
  const db = getDb();
  const evalId = randomUUID();
  const createdAt = opts?.createdAt ?? Date.now();
  const numResults = opts?.numResults ?? 1;

  db.insert(evalsTable)
    .values({
      id: evalId,
      createdAt,
      config: { providers: ['test'] } as any,
      results: {},
      isRedteam: false,
    })
    .run();

  for (let i = 0; i < numResults; i++) {
    db.insert(evalResultsTable)
      .values({
        id: randomUUID(),
        createdAt,
        updatedAt: createdAt,
        evalId,
        promptIdx: 0,
        testIdx: i,
        testCase: { vars: {} },
        prompt: { raw: 'test', label: 'test' },
        provider: { id: 'test-provider' },
        response: {
          output: 'test output',
          tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
        },
        success: true,
        score: 1,
      })
      .run();
  }

  return evalId;
}

describe('redteamProbeLimit', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals');
  });

  describe('getMonthStartTimestamp', () => {
    it('should return the first day of the current month at midnight', () => {
      const result = getMonthStartTimestamp();
      const date = new Date(result);
      expect(date.getDate()).toBe(1);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
      expect(date.getSeconds()).toBe(0);
      expect(date.getMilliseconds()).toBe(0);
    });
  });

  describe('getMonthlyRedteamProbeUsage', () => {
    it('should return 0 when there are no evals', () => {
      expect(getMonthlyRedteamProbeUsage()).toBe(0);
    });

    it('should count probes from redteam evals in the current month', () => {
      insertRedteamEval({ numResults: 3, numRequestsPerResult: 1 });
      expect(getMonthlyRedteamProbeUsage()).toBe(3);
    });

    it('should count multi-turn probes correctly using numRequests', () => {
      // Simulates a multi-turn strategy where each result has multiple target calls
      insertRedteamEval({ numResults: 2, numRequestsPerResult: 10 });
      expect(getMonthlyRedteamProbeUsage()).toBe(20);
    });

    it('should not count non-redteam evals', () => {
      insertNonRedteamEval({ numResults: 5 });
      expect(getMonthlyRedteamProbeUsage()).toBe(0);
    });

    it('should not count evals from previous months', () => {
      const lastMonth = new Date();
      lastMonth.setDate(1);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      insertRedteamEval({
        createdAt: lastMonth.getTime(),
        numResults: 5,
        numRequestsPerResult: 1,
      });
      expect(getMonthlyRedteamProbeUsage()).toBe(0);
    });

    it('should aggregate probes across multiple redteam evals', () => {
      insertRedteamEval({ numResults: 3, numRequestsPerResult: 1 });
      insertRedteamEval({ numResults: 2, numRequestsPerResult: 5 });
      // 3*1 + 2*5 = 13
      expect(getMonthlyRedteamProbeUsage()).toBe(13);
    });

    it('should fall back to 1 per result when numRequests is not present', () => {
      const db = getDb();
      const evalId = randomUUID();
      const now = Date.now();

      db.insert(evalsTable)
        .values({
          id: evalId,
          createdAt: now,
          config: { redteam: { plugins: [] } },
          results: {},
          isRedteam: true,
        })
        .run();

      // Insert result without numRequests in tokenUsage
      db.insert(evalResultsTable)
        .values({
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
          evalId,
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: {} },
          prompt: { raw: 'test', label: 'test' },
          provider: { id: 'test-provider' },
          response: {
            output: 'test output',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          },
          success: true,
          score: 1,
        })
        .run();

      expect(getMonthlyRedteamProbeUsage()).toBe(1);
    });

    it('should detect redteam evals via config JSON even if isRedteam column is false', () => {
      const db = getDb();
      const evalId = randomUUID();
      const now = Date.now();

      // Insert with isRedteam=false but config has redteam key
      db.insert(evalsTable)
        .values({
          id: evalId,
          createdAt: now,
          config: { redteam: { plugins: ['harmful'] } } as any,
          results: {},
          isRedteam: false,
        })
        .run();

      db.insert(evalResultsTable)
        .values({
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
          evalId,
          promptIdx: 0,
          testIdx: 0,
          testCase: { vars: {} },
          prompt: { raw: 'test', label: 'test' },
          provider: { id: 'test-provider' },
          response: {
            output: 'test',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 3 },
          },
          success: true,
          score: 1,
        })
        .run();

      expect(getMonthlyRedteamProbeUsage()).toBe(3);
    });
  });

  describe('checkRedteamProbeLimit', () => {
    it('should return withinLimit=true when no usage', () => {
      const result = checkRedteamProbeLimit();
      expect(result.withinLimit).toBe(true);
      expect(result.used).toBe(0);
      expect(result.remaining).toBe(MONTHLY_PROBE_LIMIT);
      expect(result.limit).toBe(MONTHLY_PROBE_LIMIT);
    });

    it('should return withinLimit=true when under limit', () => {
      insertRedteamEval({ numResults: 10, numRequestsPerResult: 1 });
      const result = checkRedteamProbeLimit();
      expect(result.withinLimit).toBe(true);
      expect(result.used).toBe(10);
      expect(result.remaining).toBe(MONTHLY_PROBE_LIMIT - 10);
    });

    it('should return withinLimit=false when at or over limit', () => {
      // Insert enough probes to exceed the limit
      // We'll use a large numRequests to simulate hitting the limit
      const numResultsNeeded = 1000;
      const numRequestsPerResult = Math.ceil(MONTHLY_PROBE_LIMIT / numResultsNeeded) + 1;
      insertRedteamEval({ numResults: numResultsNeeded, numRequestsPerResult });

      const result = checkRedteamProbeLimit();
      expect(result.withinLimit).toBe(false);
      expect(result.used).toBeGreaterThanOrEqual(MONTHLY_PROBE_LIMIT);
      expect(result.remaining).toBe(0);
    });

    it('should exempt cloud-authenticated users', async () => {
      const { isLoggedIntoCloud } = await import('../../src/globalConfig/accounts');
      vi.mocked(isLoggedIntoCloud).mockReturnValue(true);

      // Even with probes, cloud users should be exempt
      insertRedteamEval({ numResults: 10, numRequestsPerResult: 1 });

      const result = checkRedteamProbeLimit();
      expect(result.withinLimit).toBe(true);
      expect(result.remaining).toBe(Number.POSITIVE_INFINITY);
      expect(result.limit).toBe(Number.POSITIVE_INFINITY);

      // Reset mock
      vi.mocked(isLoggedIntoCloud).mockReturnValue(false);
    });
  });
});
