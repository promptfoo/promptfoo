import { type categoryAliases, categoryAliasesReverse } from '@promptfoo/redteam/constants';
import {
  deserializePolicyIdFromMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';
import type { EvaluateResult, GradingResult } from '@promptfoo/types';

// TODO(ian): Need a much easier way to get the pluginId (and strategyId) from a result

/**
 * Check if a test belongs to a strategy.
 * Tests can belong to multiple strategies (e.g., crescendo + multilingual).
 */
export function testBelongsToStrategy(
  test: {
    metadata?: Record<string, any>;
    gradingResult?: GradingResult;
    result?: {
      testCase?: {
        metadata?: {
          strategyId?: string;
          modifiers?: {
            language?: string;
            [key: string]: any;
          };
          language?: string;
          [key: string]: any;
        };
      };
    };
    [key: string]: any;
  },
  strategy: string,
): boolean {
  const explicitStrategyId =
    test.metadata?.strategyId || test.result?.testCase?.metadata?.strategyId;

  if (explicitStrategyId === strategy) {
    return true;
  }

  // multilingual: Check for language in BOTH locations (new and old)
  if (strategy === 'multilingual') {
    const hasLanguage =
      test.metadata?.modifiers?.language || // NEW: global config path
      test.result?.testCase?.metadata?.modifiers?.language ||
      test.metadata?.language || // OLD: translation path
      test.result?.testCase?.metadata?.language;

    return !!hasLanguage;
  }

  // basic: includes ALL tests
  if (strategy === 'basic') {
    return true;
  }

  return false;
}

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
