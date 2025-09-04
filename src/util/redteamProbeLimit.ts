import chalk from 'chalk';
import { and, eq, gte } from 'drizzle-orm';
import { PROBE_LIMIT_EMAIL, PROBE_LIMIT_URL } from '../constants';
import { getDb } from '../database';
import { evalsTable } from '../database/tables';
import logger from '../logger';
import { ALLOWED_PROBE_LIMIT_EXCEEDANCE, MONTHLY_PROBE_LIMIT } from '../redteam/constants';
import { isEnterpriseCustomer } from './cloud';

const CONTACT_MESSAGE = `Contact ${PROBE_LIMIT_EMAIL} to upgrade or visit ${PROBE_LIMIT_URL} for enterprise options.`;

interface ProbeStatus {
  hasExceeded: boolean;
  usedProbes: number;
  remainingProbes: number;
  limit: number;
  enabled: boolean;
}

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
export async function checkMonthlyProbeLimit(): Promise<ProbeStatus> {
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
export function formatProbeUsageMessage(probeStatus: ProbeStatus): string {
  const { remainingProbes, usedProbes, limit } = probeStatus;
  const percentage = ((remainingProbes / limit) * 100).toFixed(1);

  if (remainingProbes <= 0) {
    return (
      `⚠️  Monthly redteam probe limit reached ${usedProbes.toLocaleString()} / ${limit.toLocaleString()} probes used\n` +
      `${CONTACT_MESSAGE}`
    );
  } else if (remainingProbes < limit * 0.2) {
    // Less than 20% remaining
    return (
      `⚠️  Low on probes: ${remainingProbes.toLocaleString()} / ${limit.toLocaleString()} remaining this month (${percentage}%)\n` +
      `${CONTACT_MESSAGE}`
    );
  } else {
    return `Redteam probes remaining this month: ${remainingProbes.toLocaleString()} / ${limit.toLocaleString()} (${percentage}%)`;
  }
}

export type ProbeCheckResult =
  | { canProceed: true; probeStatus: ProbeStatus }
  | { canProceed: false; probeStatus: ProbeStatus; exitCode: number };

/**
 * Unified function to check probe limits and handle common scenarios
 * @param estimatedProbes Optional estimated probes for the operation
 * @returns Result indicating whether the operation can proceed
 */
export async function checkProbeLimit(estimatedProbes?: number): Promise<ProbeCheckResult> {
  const probeStatus = await checkMonthlyProbeLimit();

  // Check if user has exceeded the monthly limit
  if (probeStatus.hasExceeded) {
    logger.error(
      chalk.red(`\n❌ Monthly redteam probe limit exceeded!\n`) +
        `You have used ${probeStatus.usedProbes.toLocaleString()} out of ${probeStatus.limit.toLocaleString()} probes this month.\n` +
        `The limit will reset at the beginning of next month.\n` +
        `${CONTACT_MESSAGE}`,
    );
    return { canProceed: false, probeStatus, exitCode: 1 };
  }

  // If estimatedProbes is provided, check if this operation would exceed limits
  if (estimatedProbes !== undefined) {
    // Check if this scan would exceed the limit by more than the allowed exceedance
    const exceedsProbeLimit =
      estimatedProbes > probeStatus.remainingProbes + ALLOWED_PROBE_LIMIT_EXCEEDANCE;

    if (exceedsProbeLimit) {
      logger.error(
        chalk.red(`\n❌ This scan would exceed your probe limit!\n`) +
          `This scan requires approximately ${estimatedProbes.toLocaleString()} probes, but you only have ${probeStatus.remainingProbes.toLocaleString()} remaining.\n` +
          `The scan exceeds your limit by more than ${ALLOWED_PROBE_LIMIT_EXCEEDANCE.toLocaleString()} probes and cannot be started.\n` +
          `Please reduce the number of tests or ${CONTACT_MESSAGE}\n`,
      );
      return { canProceed: false, probeStatus, exitCode: 1 };
    } else if (estimatedProbes > probeStatus.remainingProbes) {
      logger.warn(
        chalk.yellow(`\n⚠️  Warning: This scan may be limited!\n`) +
          `This scan requires approximately ${estimatedProbes.toLocaleString()} probes, but you only have ${probeStatus.remainingProbes.toLocaleString()} remaining.\n` +
          `The scan may be limited. Consider reducing the number of tests.\n` +
          `${CONTACT_MESSAGE}`,
      );
    } else {
      logger.info(`Estimated probes for this scan: ${estimatedProbes.toLocaleString()}`);
      logger.info(formatProbeUsageMessage(probeStatus));
    }
  } else {
    // Just show usage info without estimation
    logger.info(formatProbeUsageMessage(probeStatus));
  }

  return { canProceed: true, probeStatus };
}
