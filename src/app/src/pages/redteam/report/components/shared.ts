import { formatASRForDisplay } from '@app/utils/redteam';
import { calculateAttackSuccessRate } from '@promptfoo/presentation/redteamMetrics';
import {
  AGENT_OUTCOME_PLUGINS,
  type categoryAliases,
  categoryAliasesReverse,
  getAgentOutcomeCase,
} from '@promptfoo/redteam/constants';
import {
  deserializePolicyIdFromMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';
import type { EvaluateResult, GradingResult } from '@promptfoo/types';

import type { CategoryStats, TestResultStats } from './FrameworkComplianceUtils';

// TODO(ian): Need a much easier way to get the pluginId (and strategyId) from a result

/**
 * Represents a test with metadata used in red team report components.
 * This interface aligns with the structure expected by getStrategyIdFromTest and getPluginIdFromResult.
 */
export interface TestWithMetadata {
  prompt: string;
  output: string;
  gradingResult?: GradingResult;
  result?: EvaluateResult;
  metadata?: {
    strategyId?: string;
    [key: string]: unknown;
  };
}

/** All graded trials contribute findings. Attacks supply exploitability metrics. */
export type FindingStats = Required<TestResultStats> & { attacks?: Required<TestResultStats> };

export function getFindingMetrics(stats: FindingStats, description: string) {
  const attacks = stats.attacks ?? stats;
  const successfulAttacks = attacks.total - attacks.pass;
  const failedTests = stats.total - stats.pass;
  const failedBaselines = failedTests - successfulAttacks;
  return {
    description: failedBaselines
      ? `${failedBaselines} matched ${failedBaselines === 1 ? 'baseline' : 'baselines'} failed. ${description}`
      : description,
    total: stats.total,
    successfulAttacks,
    failedTests,
    passRate: attacks.total ? (attacks.pass / attacks.total) * 100 : 0,
    passRateWithFilter: attacks.total ? (attacks.passWithFilter / attacks.total) * 100 : 0,
    attackSuccessRate: attacks.total
      ? calculateAttackSuccessRate(attacks.total, attacks.failCount)
      : null,
  };
}

export function formatFindingASR(rate: number | null, digits = 2) {
  return rate === null ? 'N/A' : formatASRForDisplay(rate, digits) + '%';
}

export function flaggedByModeration(grade?: GradingResult | null) {
  return grade?.componentResults?.some(
    (result) => result.assertion?.type === 'moderation' && !result.pass,
  );
}

export function buildAttackReport<
  T extends {
    result?: { testCase?: Parameters<typeof getAgentOutcomeCase>[0] };
    gradingResult?: GradingResult;
    // Legacy verdicts can survive even when the grade is incomplete for display.
    moderationFlagged?: boolean;
  },
>(
  failures: Record<string, T[]>,
  passes: Record<string, T[]>,
  stats: Record<string, Required<TestResultStats>>,
  getStrategy: (test: T) => string,
) {
  const failuresByPlugin = { ...failures };
  const passesByPlugin = { ...passes };
  const categoryStats = { ...stats };
  const findingStats: Record<string, FindingStats> = { ...stats };
  const countsAsAttack = (test: T) => {
    const variant = getAgentOutcomeCase(test.result?.testCase)?.variant;
    return !variant || variant === 'attack';
  };
  for (const plugin of AGENT_OUTCOME_PLUGINS) {
    if (!stats[plugin]) {
      continue;
    }
    const failed = failures[plugin]?.filter(countsAsAttack) ?? [];
    const passed = passes[plugin]?.filter(countsAsAttack) ?? [];
    const total = failed.length + passed.length;
    if (total === stats[plugin].total) {
      continue;
    }
    failuresByPlugin[plugin] = failed;
    passesByPlugin[plugin] = passed;
    const attacks = {
      total,
      failCount: failed.length,
      pass: passed.length,
      passWithFilter:
        passed.length +
        failed.filter((test) => test.moderationFlagged ?? flaggedByModeration(test.gradingResult))
          .length,
    };
    findingStats[plugin] = { ...stats[plugin], attacks };
    if (total) {
      categoryStats[plugin] = attacks;
    } else {
      delete categoryStats[plugin];
    }
  }

  const strategyStats: CategoryStats = {};
  for (const [byPlugin, count] of [
    [failuresByPlugin, 'failCount'],
    [passesByPlugin, 'pass'],
  ] as const) {
    for (const tests of Object.values(byPlugin)) {
      for (const test of tests) {
        const id = getStrategy(test);
        const strategy = (strategyStats[id] ??= { pass: 0, total: 0, failCount: 0 });
        strategy.total++;
        strategy[count]++;
      }
    }
  }
  return { categoryStats, strategyStats, failuresByPlugin, passesByPlugin, findingStats };
}

export function getStrategyIdFromTest(test: TestWithMetadata): string {
  // Check metadata directly on test
  if (test.metadata?.strategyId) {
    return test.metadata.strategyId as string;
  }

  // Check metadata from test.result.testCase
  if (test.result?.testCase?.metadata?.strategyId) {
    return test.result.testCase.metadata.strategyId as string;
  }

  // Default fallback
  return 'basic';
}

export function getPluginIdFromResult(result: EvaluateResult): string | null {
  if (
    result.metadata?.pluginId &&
    // Policy plugins are handled separately
    result.metadata.pluginId !== 'policy'
  ) {
    return result.metadata.pluginId as string;
  }

  const harmCategory = result.vars?.harmCategory || result.metadata?.harmCategory;
  if (harmCategory) {
    return categoryAliasesReverse[harmCategory as keyof typeof categoryAliases];
  }

  const metricNames =
    result.gradingResult?.componentResults?.map((result) => result.assertion?.metric) || [];

  for (const metric of metricNames) {
    if (!metric) {
      continue;
    }

    // Parse and return the policy ID from the policy metric
    if (isPolicyMetric(metric)) {
      return deserializePolicyIdFromMetric(metric);
    }

    const metricParts = metric.split('/');
    const baseName = metricParts[0];

    if (baseName && categoryAliasesReverse[baseName as keyof typeof categoryAliases]) {
      return categoryAliasesReverse[baseName as keyof typeof categoryAliases];
    }
  }

  return null;
}

export const getPassRateStyles = (passRate: number): { bg: string; text: string } => {
  if (passRate >= 0.9) {
    return {
      bg: 'bg-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  if (passRate >= 0.7) {
    return {
      bg: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
    };
  }
  if (passRate >= 0.5) {
    return {
      bg: 'bg-orange-500',
      text: 'text-orange-600 dark:text-orange-400',
    };
  }
  return {
    bg: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
  };
};
