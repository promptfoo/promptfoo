import type { Strategy } from './constants';
import type { RedteamStrategy } from './types';

export function getStrategyId(strategy: RedteamStrategy): string {
  return typeof strategy === 'string' ? strategy : strategy.id;
}

export const STRATEGY_PROBE_MULTIPLIER: Record<Strategy, number> = {
  audio: 1,
  base64: 1,
  basic: 1,
  'best-of-n': 1,
  camelcase: 1,
  citation: 1,
  crescendo: 10,
  default: 1,
  emoji: 1,
  gcg: 1,
  goat: 5,
  hex: 1,
  homoglyph: 1,
  image: 1,
  jailbreak: 10,
  'jailbreak:composite': 5,
  'jailbreak:likert': 1,
  'jailbreak:tree': 150,
  leetspeak: 1,
  'math-prompt': 1,
  morse: 1,
  multilingual: 3, // This won't matter, we multiply all probes by number of languages
  'other-encodings': 2,
  pandamonium: 5,
  piglatin: 1,
  custom: 10,
  'prompt-injection': 1,
  retry: 1,
  rot13: 1,
  video: 1,
};

interface ConfigWithStrategies {
  numTests?: number;
  plugins: { length: number } | any[];
  strategies: RedteamStrategy[];
}

export function getEstimatedProbes<T extends ConfigWithStrategies>(config: T): number {
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