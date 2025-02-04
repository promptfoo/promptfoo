// This file is imported by the frontend and shouldn't use native dependencies.
import type { UnifiedConfig, Vars } from '../types';
import {
  MULTI_TURN_STRATEGIES,
  type Plugin,
  riskCategorySeverityMap,
  type Severity,
} from './constants';
import type { RedteamPluginObject, SavedRedteamConfig } from './types';

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
    defaultTest,
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
    },
  };
}
