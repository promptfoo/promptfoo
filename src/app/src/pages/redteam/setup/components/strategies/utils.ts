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

const DEFAULT_NUM_TESTS = 5;
const DEFAULT_MULTILINGUAL_LANGUAGE_COUNT = 3;
const ALL_PLUGINS_BREAKDOWN_ID = 'all-plugins';
const BASE_STRATEGY_ID = 'base';

export interface ProbeEstimateBreakdownItem {
  pluginId: string;
  strategyId: string;
  min: number;
  likely: number;
  max: number;
  ceiling: number;
  reason: string;
}

export interface ProbeEstimateRange {
  min: number;
  likely: number;
  max: number;
  ceiling: number;
  assumptions: string[];
  breakdown: ProbeEstimateBreakdownItem[];
}

interface StrategyProfile {
  minMultiplier: number;
  likelyMultiplier: number;
  maxMultiplier: number;
  ceilingMultiplier: number;
  reason: string;
}

const DETERMINISTIC_PROFILE: StrategyProfile = {
  minMultiplier: 1,
  likelyMultiplier: 1,
  maxMultiplier: 1,
  ceilingMultiplier: 1,
  reason: 'Deterministic one-to-one probe expansion.',
};

const MODERATE_PROFILE: StrategyProfile = {
  minMultiplier: 0.8,
  likelyMultiplier: 1,
  maxMultiplier: 1.4,
  ceilingMultiplier: 2,
  reason: 'Variable probe expansion with moderate runtime variance.',
};

const STRATEGY_PROFILES: Record<Strategy, StrategyProfile> = {
  audio: DETERMINISTIC_PROFILE,
  'authoritative-markup-injection': DETERMINISTIC_PROFILE,
  base64: DETERMINISTIC_PROFILE,
  basic: DETERMINISTIC_PROFILE,
  'best-of-n': MODERATE_PROFILE,
  camelcase: DETERMINISTIC_PROFILE,
  citation: MODERATE_PROFILE,
  crescendo: {
    minMultiplier: 6,
    likelyMultiplier: 10,
    maxMultiplier: 15,
    ceilingMultiplier: 20,
    reason: 'Multi-turn escalation can substantially increase probes.',
  },
  custom: {
    minMultiplier: 5,
    likelyMultiplier: 10,
    maxMultiplier: 16,
    ceilingMultiplier: 22,
    reason: 'Custom strategy behavior can vary significantly by implementation.',
  },
  default: DETERMINISTIC_PROFILE,
  emoji: DETERMINISTIC_PROFILE,
  gcg: MODERATE_PROFILE,
  goat: {
    minMultiplier: 3,
    likelyMultiplier: 5,
    maxMultiplier: 8,
    ceilingMultiplier: 12,
    reason: 'GOAT can add exploratory turns depending on target behavior.',
  },
  hex: DETERMINISTIC_PROFILE,
  homoglyph: DETERMINISTIC_PROFILE,
  image: DETERMINISTIC_PROFILE,
  'indirect-web-pwn': {
    minMultiplier: 6,
    likelyMultiplier: 10,
    maxMultiplier: 16,
    ceilingMultiplier: 24,
    reason: 'Indirect workflows can trigger variable multi-step interactions.',
  },
  jailbreak: {
    minMultiplier: 6,
    likelyMultiplier: 10,
    maxMultiplier: 14,
    ceilingMultiplier: 20,
    reason: 'Jailbreak variants can require multiple attempts per test.',
  },
  'jailbreak:composite': MODERATE_PROFILE,
  'jailbreak:hydra': {
    minMultiplier: 6,
    likelyMultiplier: 10,
    maxMultiplier: 15,
    ceilingMultiplier: 22,
    reason: 'Hydra can branch into additional target-facing turns.',
  },
  'jailbreak:likert': DETERMINISTIC_PROFILE,
  'jailbreak:meta': {
    minMultiplier: 6,
    likelyMultiplier: 10,
    maxMultiplier: 14,
    ceilingMultiplier: 20,
    reason: 'Meta-jailbreak variants can produce variable retry behavior.',
  },
  'jailbreak:tree': {
    minMultiplier: 90,
    likelyMultiplier: 150,
    maxMultiplier: 220,
    ceilingMultiplier: 320,
    reason: 'Tree search can fan out aggressively with dynamic depth.',
  },
  'jailbreak-templates': DETERMINISTIC_PROFILE,
  layer: DETERMINISTIC_PROFILE,
  leetspeak: DETERMINISTIC_PROFILE,
  'math-prompt': DETERMINISTIC_PROFILE,
  'mischievous-user': {
    minMultiplier: 2,
    likelyMultiplier: 5,
    maxMultiplier: 8,
    ceilingMultiplier: 12,
    reason: 'Roleplay behaviors can extend conversations unpredictably.',
  },
  morse: DETERMINISTIC_PROFILE,
  multilingual: DETERMINISTIC_PROFILE,
  'other-encodings': MODERATE_PROFILE,
  piglatin: DETERMINISTIC_PROFILE,
  'prompt-injection': DETERMINISTIC_PROFILE,
  retry: MODERATE_PROFILE,
  rot13: DETERMINISTIC_PROFILE,
  video: DETERMINISTIC_PROFILE,
};

interface StrategyScalingSetting {
  key: string;
  defaultValue: number;
}

const STRATEGY_SCALING_SETTINGS: Partial<Record<Strategy, StrategyScalingSetting>> = {
  crescendo: { key: 'maxTurns', defaultValue: 5 },
  custom: { key: 'maxTurns', defaultValue: 10 },
  goat: { key: 'maxTurns', defaultValue: 5 },
  'indirect-web-pwn': { key: 'maxTurns', defaultValue: 5 },
  jailbreak: { key: 'numIterations', defaultValue: 10 },
  'jailbreak:hydra': { key: 'maxTurns', defaultValue: 10 },
  'jailbreak:meta': { key: 'numIterations', defaultValue: 10 },
  'mischievous-user': { key: 'maxTurns', defaultValue: 5 },
};

function toNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return fallback;
}

function toPositiveIntegerOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  return [];
}

function clampEstimate(
  estimate: Pick<ProbeEstimateBreakdownItem, 'min' | 'likely' | 'max' | 'ceiling'>,
): Pick<ProbeEstimateBreakdownItem, 'min' | 'likely' | 'max' | 'ceiling'> {
  const min = Math.max(0, Math.floor(estimate.min));
  const likely = Math.max(min, Math.floor(estimate.likely));
  const max = Math.max(likely, Math.floor(estimate.max));
  const ceiling = Math.max(max, Math.floor(estimate.ceiling));
  return { min, likely, max, ceiling };
}

function normalizeStrategy(strategy: RedteamStrategy): {
  id: string;
  config?: Record<string, unknown>;
} {
  if (typeof strategy === 'string') {
    return { id: strategy };
  }
  return {
    id: strategy.id,
    config:
      strategy.config && typeof strategy.config === 'object'
        ? (strategy.config as Record<string, unknown>)
        : undefined,
  };
}

function getGlobalLanguageCount(
  config: Config,
  strategies: { id: string; config?: Record<string, unknown> }[],
): number {
  const globalLanguages = asStringArray(
    config.language ?? (config as Config & { languages?: string | string[] }).languages,
  );
  if (globalLanguages.length > 0) {
    return globalLanguages.length;
  }

  const multilingualStrategy = strategies.find((strategy) => strategy.id === 'multilingual');
  if (!multilingualStrategy) {
    return 1;
  }

  const strategyLanguages = asStringArray(multilingualStrategy.config?.languages);
  if (strategyLanguages.length > 0) {
    return strategyLanguages.length;
  }

  return DEFAULT_MULTILINGUAL_LANGUAGE_COUNT;
}

function getPluginLanguageCount(plugin: unknown, globalLanguageCount: number): number {
  if (!plugin || typeof plugin !== 'object' || !('config' in plugin)) {
    return globalLanguageCount;
  }
  const config = (plugin as { config?: Record<string, unknown> }).config;
  const pluginLanguage = asStringArray(config?.language);
  return pluginLanguage.length > 0 ? pluginLanguage.length : globalLanguageCount;
}

function getStrategyCap(config: Record<string, unknown> | undefined): number | null {
  return toPositiveIntegerOrNull(config?.numTests);
}

function getStrategyScalingAdjustment(
  strategyId: string,
  strategyConfig: Record<string, unknown> | undefined,
): { scale: number; note?: string } {
  const setting = STRATEGY_SCALING_SETTINGS[strategyId as Strategy];
  if (!setting) {
    return { scale: 1 };
  }

  const configured = toPositiveIntegerOrNull(strategyConfig?.[setting.key]);
  if (configured === null) {
    return { scale: 1 };
  }

  return {
    scale: configured / setting.defaultValue,
    note: `${setting.key}=${configured} (default ${setting.defaultValue})`,
  };
}

export function estimateProbeRange(config: Config): ProbeEstimateRange {
  const defaultNumTests = toPositiveIntegerOrNull(config.numTests) ?? DEFAULT_NUM_TESTS;
  const plugins = Array.isArray(config.plugins) ? config.plugins : [];
  const strategies = (Array.isArray(config.strategies) ? config.strategies : []).map(
    normalizeStrategy,
  );
  const globalLanguageCount = getGlobalLanguageCount(config, strategies);
  const breakdown: ProbeEstimateBreakdownItem[] = [];
  const assumptions = new Set<string>();

  if (plugins.length === 0) {
    assumptions.add('No plugins selected; estimate is zero.');
  }

  if (globalLanguageCount > 1) {
    assumptions.add(`Language expansion applies (${globalLanguageCount} languages).`);
  }

  const basicStrategy = strategies.find((strategy) => strategy.id === 'basic');
  const includeBaseTests = basicStrategy?.config?.enabled !== false;
  if (!includeBaseTests) {
    assumptions.add('Basic strategy is disabled, so baseline tests are excluded.');
  }

  const totalPluginProbes = plugins.reduce((sum, plugin) => {
    const pluginId = typeof plugin === 'string' ? plugin : plugin.id;
    const configuredTests =
      typeof plugin === 'string'
        ? defaultNumTests
        : toNonNegativeInteger((plugin as { numTests?: number }).numTests, defaultNumTests);
    const languageCount = getPluginLanguageCount(plugin, globalLanguageCount);
    const pluginBase = configuredTests * languageCount;

    if (includeBaseTests && pluginBase > 0) {
      const baseEstimate = clampEstimate({
        min: pluginBase,
        likely: pluginBase,
        max: pluginBase,
        ceiling: pluginBase,
      });
      breakdown.push({
        pluginId,
        strategyId: BASE_STRATEGY_ID,
        ...baseEstimate,
        reason:
          languageCount > 1
            ? `Base plugin probes expanded across ${languageCount} languages.`
            : 'Base plugin probes before strategy expansion.',
      });
    }

    return sum + pluginBase;
  }, 0);

  let totals = clampEstimate({
    min: includeBaseTests ? totalPluginProbes : 0,
    likely: includeBaseTests ? totalPluginProbes : 0,
    max: includeBaseTests ? totalPluginProbes : 0,
    ceiling: includeBaseTests ? totalPluginProbes : 0,
  });

  for (const strategy of strategies) {
    if (strategy.id === 'multilingual') {
      assumptions.add('Multilingual strategy introduces per-language expansion.');
      continue;
    }

    if (strategy.id === 'basic') {
      continue;
    }

    const profile =
      STRATEGY_PROFILES[strategy.id as Strategy] ??
      ({
        ...MODERATE_PROFILE,
        reason: 'Unrecognized strategy; using moderate variance profile.',
      } satisfies StrategyProfile);
    const strategyConfig = strategy.config;
    const strategyCap = getStrategyCap(strategyConfig);
    const fanoutMultiplier = toPositiveIntegerOrNull(strategyConfig?.n) ?? 1;
    const scalingAdjustment = getStrategyScalingAdjustment(strategy.id, strategyConfig);
    const baseForStrategy = totalPluginProbes;

    let contribution = clampEstimate({
      min: baseForStrategy * profile.minMultiplier * fanoutMultiplier * scalingAdjustment.scale,
      likely:
        baseForStrategy * profile.likelyMultiplier * fanoutMultiplier * scalingAdjustment.scale,
      max: baseForStrategy * profile.maxMultiplier * fanoutMultiplier * scalingAdjustment.scale,
      ceiling:
        baseForStrategy * profile.ceilingMultiplier * fanoutMultiplier * scalingAdjustment.scale,
    });

    if (strategy.id === 'retry') {
      const configuredRetryTests = toPositiveIntegerOrNull(strategyConfig?.numTests);
      if (configuredRetryTests !== null) {
        contribution = clampEstimate({
          min: configuredRetryTests,
          likely: configuredRetryTests,
          max: configuredRetryTests,
          ceiling: configuredRetryTests,
        });
      } else {
        const retryBaseline = includeBaseTests ? totalPluginProbes : 0;
        contribution = clampEstimate({
          min: retryBaseline * 0.2,
          likely: retryBaseline,
          max: retryBaseline * 1.5,
          ceiling: retryBaseline * 2,
        });
        assumptions.add('Retry strategy without numTests cap can vary at runtime.');
      }
    }

    if (strategyCap !== null) {
      contribution = clampEstimate({
        min: Math.min(contribution.min, strategyCap),
        likely: Math.min(contribution.likely, strategyCap),
        max: Math.min(contribution.max, strategyCap),
        ceiling: Math.min(contribution.ceiling, strategyCap),
      });
      assumptions.add(`${strategy.id} uses numTests=${strategyCap} cap.`);
    }

    if (profile !== DETERMINISTIC_PROFILE) {
      assumptions.add(profile.reason);
    }
    if (scalingAdjustment.note) {
      assumptions.add(`${strategy.id} uses ${scalingAdjustment.note}.`);
    }

    const strategyReasonSuffix = scalingAdjustment.note
      ? ` Configured ${scalingAdjustment.note}.`
      : '';

    breakdown.push({
      pluginId: ALL_PLUGINS_BREAKDOWN_ID,
      strategyId: strategy.id,
      ...contribution,
      reason:
        strategyCap !== null
          ? `${profile.reason}${strategyReasonSuffix} Capped at numTests=${strategyCap}.`
          : `${profile.reason}${strategyReasonSuffix}`,
    });

    totals = clampEstimate({
      min: totals.min + contribution.min,
      likely: totals.likely + contribution.likely,
      max: totals.max + contribution.max,
      ceiling: totals.ceiling + contribution.ceiling,
    });
  }

  return {
    ...totals,
    assumptions: [...assumptions],
    breakdown: breakdown.map((item) => ({
      ...item,
      ...clampEstimate(item),
    })),
  };
}

export function getEstimatedProbes(config: Config) {
  return estimateProbeRange(config).likely;
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
