import { isProviderOptions, type TestCase, type TestCaseWithPlugin } from '../../types/index';
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
function cloneTokenUsage(tokenUsage: TokenUsage): TokenUsage {
  return {
    ...tokenUsage,
    ...(tokenUsage.completionDetails && {
      completionDetails: { ...tokenUsage.completionDetails },
    }),
    ...(tokenUsage.assertions && {
      assertions: {
        ...tokenUsage.assertions,
        ...(tokenUsage.assertions.completionDetails && {
          completionDetails: { ...tokenUsage.assertions.completionDetails },
        }),
      },
    }),
  };
}

export function mergeProviderTokenUsage(
  existing: TokenUsage | undefined,
  update: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!existing) {
    return update ? cloneTokenUsage(update) : undefined;
  }
  if (!update) {
    return cloneTokenUsage(existing);
  }

  const merged = cloneTokenUsage(existing);

  accumulateTokenUsage(merged, update);
  return merged;
}

/**
 * Attach request-level generation usage to exactly one emitted row.
 */
export function attachProviderTokenUsage<T extends TestCase>(
  testCases: T[],
  tokenUsage: TokenUsage | undefined,
  targetIndex = 0,
): T[] {
  if (!tokenUsage || testCases.length === 0) {
    return testCases;
  }

  return testCases.map((testCase, index) =>
    index === targetIndex
      ? ({
          ...testCase,
          metadata: {
            ...testCase.metadata,
            providerTokenUsage: mergeProviderTokenUsage(
              testCase.metadata?.providerTokenUsage,
              tokenUsage,
            ),
          },
        } as T)
      : testCase,
  );
}
