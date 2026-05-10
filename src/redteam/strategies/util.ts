import { isProviderOptions, type TestCaseWithPlugin } from '../../types/index';
import { accumulateTokenUsage } from '../../util/tokenUsageUtils';
import { STRATEGY_EXEMPT_PLUGINS } from '../constants';

import type { TokenUsage } from '../../types/shared';
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
  if (STRATEGY_EXEMPT_PLUGINS.includes(pluginId as any)) {
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

  if (!targetPlugins || targetPlugins.length === 0) {
    return true; // If no targets specified, strategy applies to all plugins
  }

  return targetPlugins.some((target) => {
    // Direct match
    if (target === pluginId) {
      return true;
    }

    // Category match (e.g. 'harmful' matches 'harmful:hate')
    if ((pluginId || '').startsWith(`${target}:`)) {
      return true;
    }

    return false;
  });
}

/**
 * Merge generation-time provider usage across layered strategies without mutating prior metadata.
 */
export function mergeProviderTokenUsage(
  existing: TokenUsage | undefined,
  update: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!existing) {
    return update
      ? {
          ...update,
          ...(update.completionDetails && {
            completionDetails: { ...update.completionDetails },
          }),
          ...(update.assertions && {
            assertions: {
              ...update.assertions,
              ...(update.assertions.completionDetails && {
                completionDetails: { ...update.assertions.completionDetails },
              }),
            },
          }),
        }
      : undefined;
  }
  if (!update) {
    return {
      ...existing,
      ...(existing.completionDetails && {
        completionDetails: { ...existing.completionDetails },
      }),
      ...(existing.assertions && {
        assertions: {
          ...existing.assertions,
          ...(existing.assertions.completionDetails && {
            completionDetails: { ...existing.assertions.completionDetails },
          }),
        },
      }),
    };
  }

  const merged: TokenUsage = {
    ...existing,
    ...(existing.completionDetails && {
      completionDetails: { ...existing.completionDetails },
    }),
    ...(existing.assertions && {
      assertions: {
        ...existing.assertions,
        ...(existing.assertions.completionDetails && {
          completionDetails: { ...existing.assertions.completionDetails },
        }),
      },
    }),
  };

  accumulateTokenUsage(merged, update);
  return merged;
}
