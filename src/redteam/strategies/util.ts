import { isProviderOptions, type TestCaseWithPlugin } from '../../types/index';
import { pluginConfigMatchesStrategyTargets } from '../sharedFrontend';

import type { RedteamStrategyObject } from '../types';

export { pluginConfigMatchesStrategy, pluginConfigMatchesStrategyTargets } from '../sharedFrontend';

export function getStrategyDeduplicationKey(strategy: RedteamStrategyObject): string {
  if (strategy.id === 'layer' && strategy.config) {
    if (typeof strategy.config.label === 'string' && strategy.config.label.trim()) {
      return `layer/${strategy.config.label}`;
    }
    if (Array.isArray(strategy.config.steps)) {
      const steps = (strategy.config.steps as Array<string | { id?: string }>).map((step) =>
        typeof step === 'string' ? step : (step?.id ?? 'unknown'),
      );
      return `layer:${steps.join('->')}`;
    }
  }
  return strategy.id;
}

export function deduplicateStrategies<T extends RedteamStrategyObject>(
  strategies: readonly T[],
  onDuplicate?: (key: string) => void,
): T[] {
  const seen = new Set<string>();
  return strategies.filter((strategy) => {
    const key = getStrategyDeduplicationKey(strategy);
    if (seen.has(key)) {
      onDuplicate?.(key);
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Determines whether a strategy should be applied to a test case based on plugin targeting rules.
 *
 * - Excludes strategy-exempt plugins (defined in STRATEGY_EXEMPT_PLUGINS)
 * - Excludes sequence providers (which are verbatim and don't support strategies)
 * - Respects plugin-level strategy exclusions via excludeStrategies config
 * - Matches against target plugins through direct ID match or category prefixes
 */
export function pluginMatchesStrategyTargets(
  testCase: TestCaseWithPlugin,
  strategyId: string,
  targetPlugins?: NonNullable<RedteamStrategyObject['config']>['plugins'],
): boolean {
  const pluginId = testCase.metadata?.pluginId;
  const pluginConfig = testCase.metadata?.pluginConfig;
  if (
    !pluginId ||
    !pluginConfigMatchesStrategyTargets(pluginId, pluginConfig, strategyId, targetPlugins)
  ) {
    return false;
  }
  if (isProviderOptions(testCase.provider) && testCase.provider?.id === 'sequence') {
    // Sequence providers are verbatim and strategies don't apply
    return false;
  }

  return true;
}
