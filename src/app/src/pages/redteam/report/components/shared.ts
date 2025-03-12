import { type categoryAliases, categoryAliasesReverse } from '@promptfoo/redteam/constants';
import type { EvaluateResult, GradingResult } from '@promptfoo/types';

// TODO(ian): Need a much easier way to get the pluginId (and strategyId) from a result

export function getStrategyIdFromTest(test: {
  metadata?: Record<string, any>;
  gradingResult?: GradingResult;
  result?: {
    testCase?: {
      metadata?: {
        strategyId?: string;
        [key: string]: any;
      };
    };
  };
  [key: string]: any;
}): string {
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
  if (result.metadata?.pluginId) {
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

    const metricParts = metric.split('/');
    const baseName = metricParts[0];

    if (baseName && categoryAliasesReverse[baseName as keyof typeof categoryAliases]) {
      return categoryAliasesReverse[baseName as keyof typeof categoryAliases];
    }
  }

  return null;
}
