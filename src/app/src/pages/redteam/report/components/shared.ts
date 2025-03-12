import { type categoryAliases, categoryAliasesReverse } from '@promptfoo/redteam/constants';
import type { EvaluateResult, GradingResult } from '@promptfoo/types';

// TODO(ian): Need a much easier way to get the pluginId (and strategyId) from a result

export function getStrategyIdFromMetric(metric: string): string | null {
  const parts = metric.split('/');
  const metricSuffix = parts[1];
  if (metricSuffix) {
    if (metricSuffix === 'Base64') {
      return 'base64';
    } else if (metricSuffix === 'BestOfN') {
      return 'best-of-n';
    } else if (metricSuffix === 'Citation') {
      return 'citation';
    } else if (metricSuffix === 'Crescendo') {
      return 'crescendo';
    } else if (metricSuffix === 'GCG') {
      return 'gcg';
    } else if (metricSuffix === 'GOAT') {
      return 'goat';
    } else if (metricSuffix === 'Injection') {
      return 'prompt-injection';
    } else if (metricSuffix === 'Iterative') {
      return 'jailbreak';
    } else if (metricSuffix === 'Composite') {
      return 'jailbreak:composite';
    } else if (metricSuffix === 'Likert') {
      return 'jailbreak:likert';
    } else if (metricSuffix === 'IterativeTree') {
      return 'jailbreak:tree';
    } else if (metricSuffix === 'Leetspeak') {
      return 'leetspeak';
    } else if (metricSuffix.startsWith('MathPrompt')) {
      return 'math-prompt';
    } else if (metricSuffix.startsWith('Multilingual')) {
      return 'multilingual';
    } else if (metricSuffix === 'Rot13') {
      return 'rot13';
    } else if (metricSuffix === 'Pandamonium') {
      return 'pandamonium';
    }
  }
  return null;
}

export function getStrategyIdFromGradingResult(gradingResult?: GradingResult): string | null {
  if (!gradingResult?.componentResults) {
    return null;
  }

  for (const result of gradingResult.componentResults) {
    if (result.assertion?.metric) {
      const strategyId = getStrategyIdFromMetric(result.assertion.metric);
      if (strategyId) {
        return strategyId;
      }
    }
  }
  return null;
}

export function getPluginIdFromResult(result: EvaluateResult): string | null {
  // TODO(ian): Need a much easier way to get the pluginId (and strategyId) from a result
  const harmCategory = result.vars['harmCategory'];
  if (harmCategory) {
    return categoryAliasesReverse[harmCategory as keyof typeof categoryAliases];
  }
  const metricNames =
    result.gradingResult?.componentResults?.map((result) => result.assertion?.metric) || [];
  const metricBaseName = metricNames[0]?.split('/')[0];
  if (metricBaseName) {
    return categoryAliasesReverse[metricBaseName as keyof typeof categoryAliases];
  }
  return null;
}
