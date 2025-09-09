import chalk from 'chalk';
import { and, eq, gte } from 'drizzle-orm';
import {
  LIMITS_DOCS_PAGE,
  PROBE_LIMIT_EMAIL,
  PROBE_LIMIT_URL,
  PROBE_LIMITS_ENFORCEMENT_ENABLED,
} from '../constants';
import { getDb } from '../database';
import { evalsTable } from '../database/tables';
import logger from '../logger';
import { ALLOWED_PROBE_LIMIT_EXCEEDANCE, MONTHLY_PROBE_LIMIT } from '../redteam/constants';
import telemetry from '../telemetry';
import { isEnterpriseCustomer } from './cloud';

const CONTACT_MESSAGE = `Contact ${PROBE_LIMIT_EMAIL} to upgrade or visit ${PROBE_LIMIT_URL} to upgrade to our enterprise plan.`;

export interface ProbeStatus {
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
  const hasExceeded = usedProbes >= MONTHLY_PROBE_LIMIT;

  // Record telemetry for probe usage analytics
  telemetry.record('feature_used', {
    feature: 'redteam_probe_limits_check',
    usedProbes,
    remainingProbes,
    limit: MONTHLY_PROBE_LIMIT,
    hasExceeded,
    enforcementEnabled: PROBE_LIMITS_ENFORCEMENT_ENABLED,
    utilizationPercentage: Math.round((usedProbes / MONTHLY_PROBE_LIMIT) * 100),
  });

  return {
    hasExceeded,
    usedProbes,
    remainingProbes,
    limit: MONTHLY_PROBE_LIMIT,
    enabled: PROBE_LIMITS_ENFORCEMENT_ENABLED,
  };
}

/**
 * Create a formatted box with the given content and color
 */
function createFormattedBox(
  title: string,
  mainLine: string,
  progressBar: string,
  color: typeof chalk.red,
  includeContactInfo: boolean = false,
): string {
  const boxWidth = 58;
  const contentWidth = boxWidth - 4; // Account for "│ " on both sides

  // Create top border with embedded title
  const availableSpace = boxWidth - 2 - title.length - 2; // 2 for corners, 2 for spaces around title
  const leftDashes = Math.floor(availableSpace / 2);
  const rightDashes = availableSpace - leftDashes;
  const topBorder = `┌${'─'.repeat(leftDashes)} ${title} ${'─'.repeat(rightDashes)}┐`;

  const lines = [
    color(topBorder),
    color(`│ ${''.padEnd(contentWidth)} │`),
    color(`│ ${mainLine.padEnd(contentWidth)} │`),
    color(`│ ${progressBar.padEnd(contentWidth)} │`),
  ];

  if (includeContactInfo) {
    const emailLine = `📧 Contact: ${PROBE_LIMIT_EMAIL}`;
    const urlLine = `🌐 Visit: ${PROBE_LIMIT_URL}`;

    lines.push(
      color(`│ ${''.padEnd(contentWidth)} │`),
      color(`│ ${'To upgrade, contact:'.padEnd(contentWidth)} │`),
      color(`│ ${emailLine.padEnd(contentWidth)} │`),
      color(`│ ${urlLine.padEnd(contentWidth)} │`),
      color(`│ ${''.padEnd(contentWidth)} │`),
      color(`│ ${'Learn more:'.padEnd(contentWidth)} │`),
      color(`│ ${LIMITS_DOCS_PAGE.padEnd(contentWidth)} │`),
    );
  }

  lines.push(color('└────────────────────────────────────────────────────────┘'));

  return lines.join('\n');
}

/**
 * Format a message about remaining probes
 * @param remainingProbes Number of remaining probes
 * @returns Formatted message string
 */
export function formatProbeUsageMessage(probeStatus: ProbeStatus): string {
  const { enabled, remainingProbes, usedProbes, limit } = probeStatus;

  if (!enabled) {
    return '';
  }

  const progressBar = createRemainingProgressBar(remainingProbes, limit);

  if (remainingProbes <= 0) {
    return createFormattedBox(
      '🚫 PROBE LIMIT REACHED',
      `${usedProbes.toLocaleString().padEnd(1)} / ${limit.toLocaleString().padEnd(1)} probes used this month`,
      progressBar,
      chalk.red,
      true,
    );
  } else if (remainingProbes < limit * 0.2) {
    // Less than 20% remaining
    return createFormattedBox(
      '⚠️  LOW PROBE COUNT',
      `${remainingProbes.toLocaleString().padEnd(1)} / ${limit.toLocaleString().padEnd(1)} probes remaining  `,
      progressBar,
      chalk.yellow,
      true, // Include contact info in box
    );
  } else {
    return createFormattedBox(
      '🎯 PROBE USAGE STATUS',
      `${remainingProbes.toLocaleString().padEnd(1)} / ${limit.toLocaleString().padEnd(1)} probes remaining  `,
      progressBar,
      chalk.green,
      true, // Include contact info in box
    );
  }
}

/**
 * Create a visual progress bar showing remaining probes (not used)
 */
function createRemainingProgressBar(remaining: number, total: number, width: number = 20): string {
  const percentage = Math.min(remaining / total, 1);
  const filled = Math.floor(percentage * width);
  const empty = width - filled;

  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);

  return `${filledBar}${emptyBar}`;
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

  // If enforcement is disabled, always allow the operation to proceed
  if (!probeStatus.enabled) {
    return { canProceed: true, probeStatus };
  }

  // Check if user has exceeded the monthly limit
  if (probeStatus.hasExceeded) {
    // Record telemetry for limit enforcement
    telemetry.record('feature_used', {
      feature: 'redteam_probe_limits_enforced',
      reason: 'monthly_limit_exceeded',
      usedProbes: probeStatus.usedProbes,
      limit: probeStatus.limit,
      estimatedProbes: estimatedProbes || 0,
    });

    const errorMessage = createFormattedBox(
      '🚫 PROBE LIMIT EXCEEDED',
      `${probeStatus.usedProbes.toLocaleString()} / ${probeStatus.limit.toLocaleString()} probes used this month`,
      createRemainingProgressBar(0, probeStatus.limit),
      chalk.red,
      false,
    );
    logger.error(
      `\n${errorMessage}\n\nYou have exceeded your monthly probe limit. The limit will reset at the beginning of next month.`,
    );
    const emailLine = `📧 Contact: ${PROBE_LIMIT_EMAIL}`;
    const urlLine = `🌐 Visit: ${PROBE_LIMIT_URL}`;
    logger.error(`\nTo upgrade, contact:\n${emailLine}\n${urlLine}`);
    return { canProceed: false, probeStatus, exitCode: 1 };
  }

  // If estimatedProbes is provided, check if this operation would exceed limits
  if (estimatedProbes !== undefined) {
    // Check if this scan would exceed the limit by more than the allowed exceedance
    const exceedsProbeLimit =
      estimatedProbes > probeStatus.remainingProbes + ALLOWED_PROBE_LIMIT_EXCEEDANCE;

    if (exceedsProbeLimit) {
      // Record telemetry for scan blocked due to exceeding limits
      telemetry.record('feature_used', {
        feature: 'redteam_probe_limits_enforced',
        reason: 'scan_exceeds_limit',
        estimatedProbes,
        remainingProbes: probeStatus.remainingProbes,
        limit: probeStatus.limit,
        excessAmount: estimatedProbes - probeStatus.remainingProbes,
      });

      const errorMessage = createFormattedBox(
        '🚫 SCAN EXCEEDS LIMIT',
        `Need ${estimatedProbes.toLocaleString()} / Have ${probeStatus.remainingProbes.toLocaleString()} probes remaining`,
        createRemainingProgressBar(probeStatus.remainingProbes, probeStatus.limit),
        chalk.red,
        true,
      );
      logger.error(
        `\n${errorMessage}\n\n` +
          `This scan exceeds your limit by more than ${ALLOWED_PROBE_LIMIT_EXCEEDANCE.toLocaleString()} probes and cannot be started.\n` +
          `Please reduce the number of tests or ${CONTACT_MESSAGE}`,
      );
      return { canProceed: false, probeStatus, exitCode: 1 };
    } else if (estimatedProbes > probeStatus.remainingProbes) {
      const warningMessage = createFormattedBox(
        '⚠️  SCAN MAY BE LIMITED',
        `Need ${estimatedProbes.toLocaleString()} / Have ${probeStatus.remainingProbes.toLocaleString()} probes remaining`,
        createRemainingProgressBar(probeStatus.remainingProbes, probeStatus.limit),
        chalk.yellow,
        true,
      );
      logger.warn(
        `\n${warningMessage}\n\n` +
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
