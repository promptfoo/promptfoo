import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '../database';
import { evalsTable } from '../database/tables';
import logger from '../logger';
import { MONTHLY_PROBE_LIMIT } from '../redteam/constants';
import { isEnterpriseCustomer } from './cloud';

/**
 * Get the total number of probes used by redteam evaluations in the current month
 * @returns The total number of probes used this month
 */
export async function getMonthlyRedteamProbeUsage(): Promise<number> {
  const db = getDb();

  // Get the start of the current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthTimestamp = startOfMonth.getTime();

  try {
    // Query for all redteam evals created this month
    const results = await db
      .select({
        prompts: evalsTable.prompts,
      })
      .from(evalsTable)
      .where(and(gte(evalsTable.createdAt, startOfMonthTimestamp), eq(evalsTable.isRedteam, true)))
      .all();

    // Sum up the numRequests from tokenUsage in prompts
    let totalProbes = 0;
    for (const result of results) {
      if (result.prompts && Array.isArray(result.prompts)) {
        for (const prompt of result.prompts) {
          const numRequests = prompt.metrics?.tokenUsage?.numRequests || 0;
          totalProbes += numRequests;
        }
      }
    }

    logger.debug(`Monthly redteam probe usage: ${totalProbes}`);
    return totalProbes;
  } catch (error) {
    logger.error(`Error calculating monthly redteam probe usage: ${error}`);
    return 0;
  }
}

/**
 * Check if the monthly probe limit has been exceeded
 * @returns Object with hasExceeded flag and usage details
 */
export async function checkMonthlyProbeLimit(): Promise<{
  hasExceeded: boolean;
  usedProbes: number;
  remainingProbes: number;
  limit: number;
  enabled: boolean;
}> {
  const isEnterprise = await isEnterpriseCustomer();
  if (isEnterprise) {
    return {
      hasExceeded: false,
      usedProbes: 0,
      remainingProbes: 0,
      limit: 0,
      enabled: false,
    };
  }

  const usedProbes = await getMonthlyRedteamProbeUsage();
  const remainingProbes = Math.max(0, MONTHLY_PROBE_LIMIT - usedProbes);

  return {
    hasExceeded: usedProbes >= MONTHLY_PROBE_LIMIT,
    usedProbes,
    remainingProbes,
    limit: MONTHLY_PROBE_LIMIT,
    enabled: true,
  };
}

/**
 * Format a message about remaining probes
 * @param remainingProbes Number of remaining probes
 * @returns Formatted message string
 */
export function formatProbeUsageMessage(remainingProbes: number): string {
  const percentage = ((remainingProbes / MONTHLY_PROBE_LIMIT) * 100).toFixed(1);

  if (remainingProbes <= 0) {
    return `⚠️  Monthly redteam probe limit reached (${MONTHLY_PROBE_LIMIT.toLocaleString()} probes)`;
  } else if (remainingProbes < 5000) {
    return `⚠️  Low on probes: ${remainingProbes.toLocaleString()} remaining this month (${percentage}%)`;
  } else {
    return `ℹ️  Redteam probes remaining this month: ${remainingProbes.toLocaleString()} (${percentage}%)`;
  }
}
