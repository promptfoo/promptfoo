// This file is imported by the frontend and shouldn't use native dependencies.

import {
  ALIASED_PLUGINS,
  CANARY_BREAKING_STRATEGY_IDS,
  COLLECTIONS,
  MULTI_TURN_STRATEGIES,
  type Plugin,
  REDTEAM_DEFAULTS,
  riskCategorySeverityMap,
  type Severity,
  STRATEGY_EXEMPT_PLUGINS,
} from './constants';
import { isAttackProvider } from './shared/attackProviders';

import type { UnifiedConfig, Vars } from '../types/index';
import type { RedteamPluginObject, RedteamStrategyObject, SavedRedteamConfig } from './types';

export { REDTEAM_DEFAULTS };

export function isExpandablePluginId(pluginId: string): boolean {
  return (
    COLLECTIONS.includes(pluginId as (typeof COLLECTIONS)[number]) ||
    ALIASED_PLUGINS.includes(pluginId as (typeof ALIASED_PLUGINS)[number])
  );
}

export function pluginConfigMatchesStrategyTargets(
  pluginId: string,
  pluginConfig: unknown,
  strategyId: string,
  targetPlugins?: readonly string[],
): boolean {
  if (STRATEGY_EXEMPT_PLUGINS.includes(pluginId as (typeof STRATEGY_EXEMPT_PLUGINS)[number])) {
    return false;
  }
  if (
    pluginId.startsWith('coding-agent:') &&
    CANARY_BREAKING_STRATEGY_IDS.includes(
      strategyId as (typeof CANARY_BREAKING_STRATEGY_IDS)[number],
    )
  ) {
    return false;
  }

  const excludedStrategies =
    typeof pluginConfig === 'object' && pluginConfig !== null
      ? (pluginConfig as { excludeStrategies?: unknown }).excludeStrategies
      : undefined;
  if (Array.isArray(excludedStrategies) && excludedStrategies.includes(strategyId)) {
    return false;
  }

  return (
    !targetPlugins ||
    targetPlugins.length === 0 ||
    targetPlugins.some((target) => target === pluginId || pluginId.startsWith(`${target}:`))
  );
}

interface LayerPluginAnalysis {
  matches: boolean;
  posteriorReached: boolean;
}

interface NormalizedLayerStep {
  config?: Record<string, unknown>;
  id: string;
  node: object;
  targets?: readonly string[];
}

function normalizeLayerStep(
  step: unknown,
  inheritedTargets?: readonly string[],
): NormalizedLayerStep | undefined {
  const stepObject = typeof step === 'string' ? { id: step } : step;
  if (
    typeof stepObject !== 'object' ||
    stepObject === null ||
    !('id' in stepObject) ||
    typeof stepObject.id !== 'string'
  ) {
    return undefined;
  }
  const config =
    'config' in stepObject && typeof stepObject.config === 'object' && stepObject.config !== null
      ? (stepObject.config as Record<string, unknown>)
      : undefined;
  return {
    config,
    id: stepObject.id,
    node: stepObject,
    targets: Array.isArray(config?.plugins) ? (config.plugins as string[]) : inheritedTargets,
  };
}

function perTurnLayersHaveApplicablePosterior(
  pluginId: string,
  pluginConfig: unknown,
  steps: readonly unknown[],
  startIndex: number,
  inheritedTargets: readonly string[] | undefined,
  ancestors: ReadonlySet<object>,
): boolean {
  const activeLayers = new Set(ancestors);
  const pending: Array<{
    steps: readonly unknown[];
    index: number;
    inheritedTargets?: readonly string[];
    layer?: object;
  }> = [{ steps, index: startIndex, inheritedTargets }];

  while (pending.length > 0) {
    const current = pending[pending.length - 1];
    if (current.index >= current.steps.length) {
      if (current.layer) {
        activeLayers.delete(current.layer);
      }
      pending.pop();
      continue;
    }

    const step = normalizeLayerStep(current.steps[current.index++], current.inheritedTargets);
    if (!step) {
      continue;
    }
    if (!pluginConfigMatchesStrategyTargets(pluginId, pluginConfig, step.id, step.targets)) {
      continue;
    }
    if (step.id === 'posterior') {
      return true;
    }
    if (step.id !== 'layer') {
      continue;
    }

    const nestedSteps = Array.isArray(step.config?.steps) ? step.config.steps : [];
    if (nestedSteps.length === 0 || activeLayers.has(step.node)) {
      continue;
    }
    activeLayers.add(step.node);
    pending.push({
      steps: nestedSteps,
      index: 0,
      inheritedTargets: step.targets,
      layer: step.node,
    });
  }

  return false;
}

function analyzeLayerStepsForPlugin(
  pluginId: string,
  pluginConfig: unknown,
  steps: readonly unknown[],
  inheritedTargets?: readonly string[],
  rootLayer?: object,
): LayerPluginAnalysis {
  if (steps.length === 0) {
    return { matches: false, posteriorReached: false };
  }

  let posteriorReached = false;
  const activeLayers = new Set<object>();
  if (rootLayer) {
    activeLayers.add(rootLayer);
  }
  const pending: Array<{
    steps: readonly unknown[];
    index: number;
    inheritedTargets?: readonly string[];
    layer?: object;
  }> = [{ steps, index: 0, inheritedTargets }];

  while (pending.length > 0) {
    const current = pending[pending.length - 1];
    if (current.index >= current.steps.length) {
      if (current.layer) {
        activeLayers.delete(current.layer);
      }
      pending.pop();
      continue;
    }

    const step = normalizeLayerStep(current.steps[current.index++], current.inheritedTargets);
    if (!step) {
      return { matches: false, posteriorReached };
    }
    if (isAttackProvider(step.id)) {
      posteriorReached ||= perTurnLayersHaveApplicablePosterior(
        pluginId,
        pluginConfig,
        current.steps,
        current.index,
        current.inheritedTargets,
        activeLayers,
      );
      current.index = current.steps.length;
      continue;
    }

    if (!pluginConfigMatchesStrategyTargets(pluginId, pluginConfig, step.id, step.targets)) {
      return { matches: false, posteriorReached };
    }
    if (step.id === 'posterior') {
      posteriorReached = true;
    }
    if (step.id === 'layer') {
      const nestedSteps = Array.isArray(step.config?.steps) ? step.config.steps : [];
      if (nestedSteps.length === 0 || activeLayers.has(step.node)) {
        return { matches: false, posteriorReached };
      }
      activeLayers.add(step.node);
      pending.push({
        steps: nestedSteps,
        index: 0,
        inheritedTargets: step.targets,
        layer: step.node,
      });
    }
  }

  return { matches: true, posteriorReached };
}

export function pluginConfigMatchesStrategy(
  pluginId: string,
  pluginConfig: unknown,
  strategy: RedteamStrategyObject,
): boolean {
  const targetPlugins = strategy.config?.plugins;
  if (!pluginConfigMatchesStrategyTargets(pluginId, pluginConfig, strategy.id, targetPlugins)) {
    return false;
  }
  if (strategy.id !== 'layer') {
    return true;
  }
  return analyzeLayerStepsForPlugin(
    pluginId,
    pluginConfig,
    Array.isArray(strategy.config?.steps) ? strategy.config.steps : [],
    targetPlugins,
    strategy,
  ).matches;
}

export function pluginConfigHasApplicablePosterior(
  pluginId: string,
  pluginConfig: unknown,
  strategy: RedteamStrategyObject,
): boolean {
  const targetPlugins = strategy.config?.plugins;
  if (!pluginConfigMatchesStrategyTargets(pluginId, pluginConfig, strategy.id, targetPlugins)) {
    return false;
  }
  if (strategy.id === 'posterior') {
    return true;
  }
  if (strategy.id !== 'layer') {
    return false;
  }
  return analyzeLayerStepsForPlugin(
    pluginId,
    pluginConfig,
    Array.isArray(strategy.config?.steps) ? strategy.config.steps : [],
    targetPlugins,
    strategy,
  ).posteriorReached;
}

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
