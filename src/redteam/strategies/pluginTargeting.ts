import { CANARY_BREAKING_STRATEGY_IDS, STRATEGY_EXEMPT_PLUGINS } from '../constants';
import { MULTI_TURN_STRATEGY_SET } from '../constants/strategies';

/** The plugin-only portion of the runtime strategy-targeting predicate. */
export function pluginIdMatchesStrategyTargets(
  pluginId: string | undefined,
  pluginConfig: Record<string, unknown> | undefined,
  strategyId: string,
  targetPlugins?: string[],
): boolean {
  if (STRATEGY_EXEMPT_PLUGINS.includes(pluginId as any)) {
    return false;
  }
  if (
    CANARY_BREAKING_STRATEGY_IDS.includes(strategyId as any) &&
    pluginId?.startsWith('coding-agent:')
  ) {
    return false;
  }
  if (MULTI_TURN_STRATEGY_SET.has(strategyId) && pluginId === 'cross-session-leak') {
    return false;
  }

  const excludedStrategies = pluginConfig?.excludeStrategies as string[] | undefined;
  if (Array.isArray(excludedStrategies) && excludedStrategies.includes(strategyId)) {
    return false;
  }

  if (!targetPlugins || targetPlugins.length === 0) {
    return true;
  }

  return targetPlugins.some(
    (target) => target === pluginId || (pluginId || '').startsWith(`${target}:`),
  );
}
