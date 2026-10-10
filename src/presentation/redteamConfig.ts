// This file is imported by the frontend and shouldn't use native dependencies.

import {
  MULTI_TURN_STRATEGIES,
  type Plugin,
  riskCategorySeverityMap,
  type Severity,
  SeveritySchema,
} from '../redteam/constants';
import { RedteamConfigSchema } from '../validators/redteam';

import type { RedteamPluginObject, SavedRedteamConfig } from '../redteam/types';
import type { UnifiedConfig, Vars } from '../types/index';

export function getRiskCategorySeverityMap(
  plugins?: RedteamPluginObject[],
): Record<Plugin, Severity> {
  const overrides =
    plugins?.reduce<Partial<Record<Plugin, Severity>>>((acc, plugin) => {
      if (plugin.severity) {
        acc[plugin.id as Plugin] = plugin.severity;

        // For 'policy' plugins, also add an entry for the specific policy ID.
        // This allows the severity to be looked up by the deserialized policy ID
        // (which is what getPluginIdFromResult returns for policy results).
        const policyId = (plugin.config as { policy?: { id?: string } } | undefined)?.policy?.id;
        if (plugin.id === 'policy' && policyId) {
          acc[policyId as Plugin] = plugin.severity;
        }
      }
      return acc;
    }, {}) || {};

  return {
    ...riskCategorySeverityMap,
    ...overrides,
  };
}

function getValidPluginNumTests(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function getValidPluginSeverity(value: unknown) {
  const parsed = SeveritySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Normalize the workload preview with the same aliases and duplicate precedence as generation. */
export function normalizeRedteamConfigForPreview(
  config: Pick<SavedRedteamConfig, 'plugins' | 'strategies' | 'numTests' | 'language'>,
) {
  const numTests = config.numTests ?? 5;
  const plugins = config.plugins.map((entry) => {
    if (typeof entry === 'string') {
      return entry;
    }
    const {
      numTests,
      severity,
      config: pluginConfig,
      ...options
    } = {
      numTests: undefined,
      severity: undefined,
      ...entry,
    };
    const validNumTests = getValidPluginNumTests(numTests);
    const validSeverity = getValidPluginSeverity(severity);
    return {
      ...options,
      ...(pluginConfig && Object.keys(pluginConfig).length > 0 && { config: pluginConfig }),
      ...(validNumTests !== undefined && { numTests: validNumTests }),
      ...(validSeverity !== undefined && { severity: validSeverity }),
    };
  });
  const normalized = RedteamConfigSchema.safeParse({
    plugins,
    numTests,
    strategies: config.strategies,
    language: config.language,
  });
  // Keep a best-effort preview while plugin or strategy fields are incomplete in the editor.
  return normalized.success
    ? {
        ...normalized.data,
        numTests: normalized.data.numTests ?? numTests,
        plugins: normalized.data.plugins ?? [],
        strategies: normalized.data.strategies ?? [],
      }
    : { plugins, numTests, strategies: config.strategies, language: config.language };
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
      ...(config.maxCharsPerMessage && {
        maxCharsPerMessage: config.maxCharsPerMessage,
      }),
      ...(config.provider && { provider: config.provider }),
      ...(config.maxConcurrency && { maxConcurrency: config.maxConcurrency }),
      ...(config.language && { language: config.language }),
      ...(config.frameworks &&
        config.frameworks.length > 0 && {
          frameworks: Array.from(new Set(config.frameworks)),
        }),
      plugins: config.plugins.map((plugin): RedteamPluginObject => {
        if (typeof plugin === 'string') {
          return { id: plugin };
        }
        const {
          config: pluginConfig,
          numTests,
          severity,
          ...pluginOptions
        } = { numTests: undefined, severity: undefined, ...plugin };
        const validNumTests = getValidPluginNumTests(numTests);
        const validSeverity = getValidPluginSeverity(severity);
        return {
          ...pluginOptions,
          ...(validSeverity !== undefined && { severity: validSeverity }),
          ...(validNumTests !== undefined && { numTests: validNumTests }),
          ...(pluginConfig && Object.keys(pluginConfig).length > 0 && { config: pluginConfig }),
        };
      }),
      strategies: config.strategies.map((strategy) => {
        if (typeof strategy === 'string') {
          if (
            MULTI_TURN_STRATEGIES.includes(strategy as (typeof MULTI_TURN_STRATEGIES)[number]) &&
            config.target.config?.stateful
          ) {
            return { id: strategy, config: { stateful: true } };
          }
          return { id: strategy };
        }

        // Determine if this is a stateful multi-turn strategy
        const isStatefulMultiTurn =
          MULTI_TURN_STRATEGIES.includes(strategy.id as (typeof MULTI_TURN_STRATEGIES)[number]) &&
          config.target.config?.stateful;

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
