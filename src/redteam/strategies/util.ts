import { isProviderOptions, type TestCase } from '../../types/index';
import { getAgentOutcomeCase, pluginIdMatchesTargets, STRATEGY_EXEMPT_PLUGINS } from '../constants';

import type { RedteamStrategyObject } from '../types';

/**
 * Determines whether a strategy should be applied to a test case based on plugin targeting rules.
 *
 * - Excludes strategy-exempt plugins (defined in STRATEGY_EXEMPT_PLUGINS)
 * - Excludes sequence providers (which are verbatim and don't support strategies)
 * - Respects plugin-level strategy exclusions via excludeStrategies config
 * - Matches against target plugins through direct ID match or category prefixes
 */
export function pluginMatchesStrategyTargets(
  testCase: TestCase,
  strategyId: string,
  targetPlugins?: NonNullable<RedteamStrategyObject['config']>['plugins'],
): boolean {
  const pluginId = testCase.metadata?.pluginId;
  // Imported trials can omit the duplicate plugin ID or carry an obsolete one.
  if (STRATEGY_EXEMPT_PLUGINS.includes(pluginId) || getAgentOutcomeCase(testCase)) {
    return false;
  }
  if (isProviderOptions(testCase.provider) && testCase.provider?.id === 'sequence') {
    // Sequence providers are verbatim and strategies don't apply
    return false;
  }

  // Check if this strategy is excluded for this plugin
  const excludedStrategies = testCase.metadata?.pluginConfig?.excludeStrategies as
    | string[]
    | undefined;
  if (Array.isArray(excludedStrategies) && excludedStrategies.includes(strategyId)) {
    return false;
  }

  return pluginIdMatchesTargets(pluginId, targetPlugins);
}
