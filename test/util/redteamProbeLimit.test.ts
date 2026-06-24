import { randomUUID } from 'crypto';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { evalResultsTable, evalsTable } from '../../src/database/tables';
import { getUserEmail, isLoggedIntoCloud } from '../../src/globalConfig/accounts';
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
async function insertRedteamEval(opts: {
  createdAt?: number;
  numResults?: number;
  numRequestsPerResult?: number;
}): Promise<string> {
  const db = await getDb();
  const evalId = randomUUID();
  const createdAt = opts.createdAt ?? Date.now();
  const numResults = opts.numResults ?? 1;
  const numRequestsPerResult = opts.numRequestsPerResult ?? 1;

  await db
    .insert(evalsTable)
    .values({
      id: evalId,
      createdAt,
      config: { redteam: { plugins: [], strategies: [] } } as any,
      results: {},
      isRedteam: true,
    })
    .run();

  for (let i = 0; i < numResults; i++) {
    await db
      .insert(evalResultsTable)
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
async function insertNonRedteamEval(opts?: {
  createdAt?: number;
  numResults?: number;
}): Promise<string> {
  const db = await getDb();
  const evalId = randomUUID();
  const createdAt = opts?.createdAt ?? Date.now();
  const numResults = opts?.numResults ?? 1;

  await db
    .insert(evalsTable)
    .values({
      id: evalId,
      createdAt,
      config: { providers: ['test'] } as any,
      results: {},
      isRedteam: false,
    })
    .run();

  for (let i = 0; i < numResults; i++) {
    await db
      .insert(evalResultsTable)
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
    const db = await getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
    vi.mocked(isLoggedIntoCloud).mockReturnValue(false);
    vi.mocked(getUserEmail).mockReturnValue('test@example.com');
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.resetAllMocks();
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
    it('should return 0 when there are no evals', async () => {
      await expect(getMonthlyRedteamProbeUsage()).resolves.toBe(0);
    });

    it('should count probes from redteam evals in the current month', async () => {
      await insertRedteamEval({ numResults: 3, numRequestsPerResult: 1 });
      await expect(getMonthlyRedteamProbeUsage()).resolves.toBe(3);
    });

    it('should count multi-turn probes correctly using numRequests', async () => {
      // Simulates a multi-turn strategy where each result has multiple target calls
      await insertRedteamEval({ numResults: 2, numRequestsPerResult: 10 });
      await expect(getMonthlyRedteamProbeUsage()).resolves.toBe(20);
    });

    it('should not count non-redteam evals', async () => {
      await insertNonRedteamEval({ numResults: 5 });
      await expect(getMonthlyRedteamProbeUsage()).resolves.toBe(0);
    });

    it('should not count evals from previous months', async () => {
      await insertRedteamEval({
        createdAt: getMonthStartTimestamp() - 1,
        numResults: 5,
        numRequestsPerResult: 1,
      });
      await expect(getMonthlyRedteamProbeUsage()).resolves.toBe(0);
    });

    it('should aggregate probes across multiple redteam evals', async () => {
      await insertRedteamEval({ numResults: 3, numRequestsPerResult: 1 });
      await insertRedteamEval({ numResults: 2, numRequestsPerResult: 5 });
      // 3*1 + 2*5 = 13
      await expect(getMonthlyRedteamProbeUsage()).resolves.toBe(13);
    });

    it('should fall back to 1 per result when numRequests is not present', async () => {
      const db = await getDb();
      const evalId = randomUUID();
      const now = Date.now();

      await db
        .insert(evalsTable)
        .values({
          id: evalId,
          createdAt: now,
          config: { redteam: { plugins: [] } },
          results: {},
          isRedteam: true,
        })
        .run();

      // Insert result without numRequests in tokenUsage
      await db
        .insert(evalResultsTable)
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

      await expect(getMonthlyRedteamProbeUsage()).resolves.toBe(1);
    });

    it('should detect redteam evals via config JSON even if isRedteam column is false', async () => {
      const db = await getDb();
      const evalId = randomUUID();
      const now = Date.now();

      // Insert with isRedteam=false but config has redteam key
      await db
        .insert(evalsTable)
        .values({
          id: evalId,
          createdAt: now,
          config: { redteam: { plugins: ['harmful'] } } as any,
          results: {},
          isRedteam: false,
        })
        .run();

      await db
        .insert(evalResultsTable)
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

      await expect(getMonthlyRedteamProbeUsage()).resolves.toBe(3);
    });
  });

  describe('checkRedteamProbeLimit', () => {
    it('should return withinLimit=true when no usage', async () => {
      const result = await checkRedteamProbeLimit();
      expect(result.withinLimit).toBe(true);
      expect(result.used).toBe(0);
      expect(result.remaining).toBe(MONTHLY_PROBE_LIMIT);
      expect(result.limit).toBe(MONTHLY_PROBE_LIMIT);
    });

    it('should return withinLimit=true when under limit', async () => {
      await insertRedteamEval({ numResults: 10, numRequestsPerResult: 1 });
      const result = await checkRedteamProbeLimit();
      expect(result.withinLimit).toBe(true);
      expect(result.used).toBe(10);
      expect(result.remaining).toBe(MONTHLY_PROBE_LIMIT - 10);
    });

    it('should return withinLimit=false when at or over limit', async () => {
      // Insert enough probes to exceed the limit
      // We'll use a large numRequests to simulate hitting the limit
      const numResultsNeeded = 1000;
      const numRequestsPerResult = Math.ceil(MONTHLY_PROBE_LIMIT / numResultsNeeded) + 1;
      await insertRedteamEval({ numResults: numResultsNeeded, numRequestsPerResult });

      const result = await checkRedteamProbeLimit();
      expect(result.withinLimit).toBe(false);
      expect(result.used).toBeGreaterThanOrEqual(MONTHLY_PROBE_LIMIT);
      expect(result.remaining).toBe(0);
    });

    it('should exempt cloud-authenticated users', async () => {
      vi.mocked(isLoggedIntoCloud).mockReturnValue(true);

      // Even with probes, cloud users should be exempt
      await insertRedteamEval({ numResults: 10, numRequestsPerResult: 1 });

      const result = await checkRedteamProbeLimit();
      expect(result.withinLimit).toBe(true);
      expect(result.remaining).toBe(Number.POSITIVE_INFINITY);
      expect(result.limit).toBe(Number.POSITIVE_INFINITY);
    });
  });
});
