import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import type { Strategy } from '@promptfoo/redteam/constants';
import type { RedteamStrategy } from '@promptfoo/redteam/types';

import type { Config } from '../../types';

export function getStrategyId(strategy: RedteamStrategy): string {
  return typeof strategy === 'string' ? strategy : strategy.id;
}

// Strategies that require configuration before they can be used
export const STRATEGIES_REQUIRING_CONFIG = ['layer', 'custom'];

/**
 * Checks if layer strategy has valid configuration
 * @param strategy The strategy object
 * @returns true if layer strategy has steps configured
 */
function isLayerStrategyConfigValid(strategy: RedteamStrategy): boolean {
  const config = typeof strategy === 'object' ? strategy.config : undefined;
  const steps = config?.steps;
  // Validate that steps array exists, has length, and contains valid non-empty values
  return (
    Array.isArray(steps) &&
    steps.length > 0 &&
    steps.every((step) => step != null && step !== '' && typeof step !== 'undefined')
  );
}

/**
 * Checks if custom strategy has valid configuration
 * @param strategy The strategy object
 * @returns true if custom strategy has strategyText configured
 */
function isCustomStrategyConfigValid(strategy: RedteamStrategy): boolean {
  const config = typeof strategy === 'object' ? strategy.config : undefined;
  const strategyText = config?.strategyText;
  return typeof strategyText === 'string' && strategyText.trim().length > 0;
}

/**
 * Checks if a strategy is properly configured
 * @param strategyId The ID of the strategy to check
 * @param strategy The full strategy object
 * @returns true if the strategy is configured or doesn't require configuration
 */
export function isStrategyConfigured(strategyId: string, strategy: RedteamStrategy): boolean {
  if (!STRATEGIES_REQUIRING_CONFIG.includes(strategyId)) {
    return true;
  }

  if (strategyId === 'layer') {
    return isLayerStrategyConfigValid(strategy);
  }

  if (strategyId === 'custom') {
    return isCustomStrategyConfigValid(strategy);
  }

  return true;
}

const STRATEGY_PROBE_MULTIPLIER: Record<Strategy, number> = {
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
  'indirect-web-pwn': 3,
  jailbreak: 10,
  'jailbreak:composite': 5,
  'jailbreak:hydra': 10,
  'jailbreak:likert': 1,
  'jailbreak:meta': 10,
  'jailbreak:tree': 150,
  'jailbreak-templates': 1,
  layer: 1,
  leetspeak: 1,
  'math-prompt': 1,
  'mcp-shadow': 1,
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
