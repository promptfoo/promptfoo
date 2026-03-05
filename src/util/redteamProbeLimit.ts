import { sql } from 'drizzle-orm';
import { getDb } from '../database/index';
import { evalResultsTable, evalsTable } from '../database/tables';
import { isLoggedIntoCloud } from '../globalConfig/accounts';

export const MONTHLY_PROBE_LIMIT = 100_000;

/**
 * Get the start of the current month as a Unix timestamp in milliseconds.
 */
export function getMonthStartTimestamp(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/**
 * Count the total number of probes (target requests) from redteam evals
 * in the current month.
 *
 * A "probe" is a single request to the user's target application.
 * For multi-turn strategies (crescendo, GOAT, hydra), each turn counts as one probe.
 * The probe count is tracked via `response.tokenUsage.numRequests` on each eval result.
 * Falls back to 1 per result row if numRequests is not present.
 */
export function getMonthlyRedteamProbeUsage(): number {
  const db = getDb();
  const monthStart = getMonthStartTimestamp();

  const result = db
    .select({
      totalProbes: sql<number>`COALESCE(SUM(COALESCE(
        json_extract(${evalResultsTable.response}, '$.tokenUsage.numRequests'),
        1
      )), 0)`,
    })
    .from(evalResultsTable)
    .innerJoin(evalsTable, sql`${evalResultsTable.evalId} = ${evalsTable.id}`)
    .where(
      sql`${evalsTable.createdAt} >= ${monthStart}
        AND (${evalsTable.isRedteam} = 1
          OR json_type(${evalsTable.config}, '$.redteam') IS NOT NULL)`,
    )
    .get();

  return result?.totalProbes ?? 0;
}

export interface ProbeLimitResult {
  withinLimit: boolean;
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Check if the user is within the monthly redteam probe limit.
 * Users authenticated via `promptfoo auth login` (cloud users) are exempt.
 */
export function checkRedteamProbeLimit(): ProbeLimitResult {
  if (isLoggedIntoCloud()) {
    return {
      withinLimit: true,
      used: 0,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
    };
  }

  const used = getMonthlyRedteamProbeUsage();
  const remaining = Math.max(0, MONTHLY_PROBE_LIMIT - used);

  return {
    withinLimit: used < MONTHLY_PROBE_LIMIT,
    used,
    limit: MONTHLY_PROBE_LIMIT,
    remaining,
  };
}
