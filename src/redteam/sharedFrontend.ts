// This file is imported by the frontend and shouldn't use native dependencies.

import {
  MULTI_TURN_STRATEGIES,
  type Plugin,
  riskCategorySeverityMap,
  type Severity,
  type Strategy,
} from './constants';

import type { UnifiedConfig, Vars } from '../types';
import type { RedteamPluginObject, RedteamStrategy, SavedRedteamConfig } from './types';

export function getRiskCategorySeverityMap(
  plugins?: RedteamPluginObject[],
): Record<Plugin, Severity> {
  const overrides =
    plugins?.reduce(
      (acc, plugin) => {
        if (plugin.severity) {
          acc[plugin.id as Plugin] = plugin.severity;
        }
        return acc;
      },
      {} as Record<Plugin, Severity>,
    ) || {};

  return {
    ...riskCategorySeverityMap,
    ...overrides,
  };
}

export function getUnifiedConfig(
  config: SavedRedteamConfig,
): UnifiedConfig & { redteam: NonNullable<UnifiedConfig['redteam']> } {
  // Remove UI specific configs from target
  const target = { ...config.target, config: { ...config.target.config } };
  delete target.config.sessionSource;
  delete target.config.stateful;

  const defaultTest = {
    ...(config.defaultTest ?? {}),
    options: {
      ...(config.defaultTest?.options ?? {}),
      transformVars: '{ ...vars, sessionId: context.uuid }',
    },
    vars: config.defaultTest?.vars as Record<string, Vars>,
  };

  return {
    description: config.description,
    targets: [target],
    prompts: config.prompts,
    extensions: config.extensions,
    defaultTest,
    redteam: {
      purpose: config.purpose,
      numTests: config.numTests,
      ...(config.maxConcurrency && { maxConcurrency: config.maxConcurrency }),
      plugins: config.plugins.map((plugin): RedteamPluginObject => {
        if (typeof plugin === 'string') {
          return { id: plugin };
        }
        return {
          id: plugin.id,
          ...(plugin.config && Object.keys(plugin.config).length > 0 && { config: plugin.config }),
        };
      }),
      strategies: config.strategies.map((strategy) => {
        if (typeof strategy === 'string') {
          if (MULTI_TURN_STRATEGIES.includes(strategy as any) && config.target.config.stateful) {
            return { id: strategy, config: { stateful: true } };
          }
          return { id: strategy };
        }

        // Determine if this is a stateful multi-turn strategy
        const isStatefulMultiTurn =
          MULTI_TURN_STRATEGIES.includes(strategy.id as any) && config.target.config.stateful;

        // Check if we have any custom configuration
        const hasCustomConfig = strategy.config && Object.keys(strategy.config).length > 0;

        // If we don't need any configuration, return just the ID
        if (!isStatefulMultiTurn && !hasCustomConfig) {
          return { id: strategy.id };
        }

        // Build the configuration object
        const configObject = {
          ...(isStatefulMultiTurn && { stateful: true }),
          ...(strategy.config || {}),
        };

        // Return the strategy with its configuration
        return {
          id: strategy.id,
          config: configObject,
        };
      }),
      ...(config.testGenerationInstructions && {
        testGenerationInstructions: config.testGenerationInstructions,
      }),
    },
  };
}

const STRATEGY_PROBE_MULTIPLIER: Record<Strategy, number> = {
  audio: 1,
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
  'jailbreak:tree': 150,
  leetspeak: 1,
  'math-prompt': 1,
  'mischievous-user': 5,
  morse: 1,
  multilingual: 3, // This won't matter, we multiply all probes by number of languages
  'other-encodings': 1,
  emoji: 1,
  piglatin: 1,
  'prompt-injection': 1,
  retry: 1,
  rot13: 1,
  video: 1,
};

export interface EstimatedProbesConfig {
  numTests?: number;
  plugins: Array<any>;
  strategies: RedteamStrategy[];
}

export function getEstimatedProbes(config: EstimatedProbesConfig): number {
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
