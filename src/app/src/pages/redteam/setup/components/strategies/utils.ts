import type { Strategy } from '@promptfoo/redteam/constants';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import type { RedteamStrategy } from '@promptfoo/redteam/types';

import type { Config } from '../../types';

export function getStrategyId(strategy: RedteamStrategy): string {
  return typeof strategy === 'string' ? strategy : strategy.id;
}

const STRATEGY_PROBE_MULTIPLIER: Record<Strategy, number> = {
  simba: 10,
  audio: 1,
  'authoritative-markup-injection': 1,
  base64: 1,
  basic: 1,
  'best-of-n': 1,
  camelcase: 1,
  citation: 1,
  crescendo: 10,
  custom: 10,
  default: 1,
  gcg: 1,
  goat: 5,
  hex: 1,
  homoglyph: 1,
  image: 1,
  jailbreak: 10,
  'jailbreak:composite': 5,
  'jailbreak:likert': 1,
  'jailbreak:meta': 10,
  'jailbreak:tree': 150,
  layer: 1,
  leetspeak: 1,
  'math-prompt': 1,
  'mischievous-user': 5,
  morse: 1,
  multilingual: 1, // Deprecated: now handled by global language config
  'other-encodings': 1,
  emoji: 1,
  piglatin: 1,
  'prompt-injection': 1,
  retry: 1,
  rot13: 1,
  video: 1,
};

export function getEstimatedProbes(config: Config) {
  const numTests = config.numTests ?? 5;
  const baseProbes = numTests * config.plugins.length;

  // Calculate total multiplier for all active strategies
  const strategyMultiplier = config.strategies.reduce((total, strategy) => {
    const strategyId: Strategy =
      typeof strategy === 'string' ? (strategy as Strategy) : (strategy.id as Strategy);
    return total + STRATEGY_PROBE_MULTIPLIER[strategyId];
  }, 0);

  // Get number of languages from global language config
  const numLanguages = Array.isArray(config.language)
    ? config.language.length
    : config.language
      ? 1
      : 1;

  const strategyProbes = strategyMultiplier * baseProbes;

  return (baseProbes + strategyProbes) * numLanguages;
}

export function getEstimatedDuration(config: Config): string {
  const numProbes = getEstimatedProbes(config);
  const concurrency = config.maxConcurrency || REDTEAM_DEFAULTS.MAX_CONCURRENCY;

  // Estimate test generation time (roughly 1-2 seconds per test)
  const testGenTime = Math.ceil((config.numTests || 1) * 1.5);

  // Estimate probe execution time (roughly 2-5 seconds per probe, accounting for concurrency)
  const avgProbeTime = 3; // seconds
  const probeExecutionTime = Math.ceil((numProbes * avgProbeTime) / concurrency);

  const totalSeconds = testGenTime + probeExecutionTime;

  if (totalSeconds < 60) {
    return `~${totalSeconds}s`;
  } else if (totalSeconds < 3600) {
    const minutes = Math.ceil(totalSeconds / 60);
    return `~${minutes}m`;
  } else {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.ceil((totalSeconds % 3600) / 60);
    return `~${hours}h ${minutes}m`;
  }
}
