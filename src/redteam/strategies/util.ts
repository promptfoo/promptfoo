import { isProviderOptions, type TestCaseWithPlugin } from '../../types/index';
import { pluginIdMatchesStrategyTargets } from './pluginTargeting';

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
  testCase: TestCaseWithPlugin,
  strategyId: string,
  targetPlugins?: NonNullable<RedteamStrategyObject['config']>['plugins'],
): boolean {
  const pluginId = testCase.metadata?.pluginId;
  if (
    !pluginIdMatchesStrategyTargets(
      pluginId,
      testCase.metadata?.pluginConfig,
      strategyId,
      targetPlugins,
    )
  ) {
    return false;
  }
  if (isProviderOptions(testCase.provider) && testCase.provider?.id === 'sequence') {
    // Sequence providers are verbatim and strategies don't apply
    return false;
  }
  return true;
}

export { pluginIdMatchesStrategyTargets } from './pluginTargeting';
