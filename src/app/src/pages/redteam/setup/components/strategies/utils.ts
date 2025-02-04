import type { Strategy } from '@promptfoo/redteam/constants';
import type { RedteamStrategy } from '@promptfoo/redteam/types';
import type { Config } from '../../types';

export function getStrategyId(strategy: RedteamStrategy): string {
  return typeof strategy === 'string' ? strategy : strategy.id;
}

export const STRATEGY_PROBE_MULTIPLIER: Record<Strategy, number> = {
  default: 1,
  basic: 1,
  jailbreak: 10,
  'jailbreak:composite': 5,
  'prompt-injection': 1,
  base64: 1,
  citation: 1,
  crescendo: 10,
  gcg: 1,
  goat: 5,
  'jailbreak:tree': 150,
  'jailbreak:likert': 1,
  leetspeak: 1,
  'math-prompt': 1,
  multilingual: 3, // This won't matter, we multiply all probes by number of languages
  rot13: 1,
  'best-of-n': 1,
  pandamonium: 5,
  hex: 1,
};

export function getEstimatedProbes(config: Config) {
  const numTests = config.numTests ?? 5;
  const baseProbes = numTests * config.plugins.length;

  // Calculate total multiplier for all active strategies
  const strategyMultiplier = config.strategies.reduce((total, strategy) => {
    const strategyId: Strategy =
      typeof strategy === 'string' ? (strategy as Strategy) : (strategy.id as Strategy);
    // Don't add 1 since we handle multilingual separately
    return total + (strategyId === 'multilingual' ? 0 : STRATEGY_PROBE_MULTIPLIER[strategyId]);
  }, 0);

  // Find if multilingual strategy is present and get number of languages
  const multilingualStrategy = config.strategies.find(
    (s) => (typeof s === 'string' ? s : s.id) === 'multilingual',
  );

  const numLanguages =
    multilingualStrategy && typeof multilingualStrategy !== 'string'
      ? ((multilingualStrategy.config?.languages as string[]) || []).length || 3
      : 1;

  const strategyProbes = strategyMultiplier * baseProbes;

  return (baseProbes + strategyProbes) * numLanguages;
}
