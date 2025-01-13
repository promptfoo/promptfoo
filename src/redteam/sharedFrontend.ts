// This file is imported by the frontend and shouldn't use native dependencies.
import type { UnifiedConfig } from '../types';
import { type Severity, type Plugin, riskCategorySeverityMap } from './constants';
import type { RedteamPluginObject, SavedRedteamConfig } from './types';

const MULTI_TURN_STRATEGIES = ['goat', 'crescendo'];

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
  return {
    description: config.description,
    targets: [config.target],
    prompts: config.prompts,
    redteam: {
      purpose: config.purpose,
      numTests: config.numTests,
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
          return { id: strategy };
        }
        const strategyConfig = {
          id: strategy.id,
          config: {},
          ...(strategy.config &&
            Object.keys(strategy.config).length > 0 && { config: strategy.config }),
        };
        // Don't bother setting the stateless config for single-turn strategies
        if (MULTI_TURN_STRATEGIES.includes(strategy.id)) {
          strategyConfig.config.stateless = config.stateless;
        }
        return strategyConfig;
      }),
    },
  };
}
