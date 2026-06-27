// This file is imported by the frontend and shouldn't use native dependencies.

import {
  ALIASED_PLUGIN_MAPPINGS,
  ALIASED_PLUGINS,
  CANARY_BREAKING_STRATEGY_IDS,
  COLLECTIONS,
  DEFAULT_PLUGINS,
  FOUNDATION_PLUGINS,
  GUARDRAILS_EVALUATION_PLUGINS,
  MULTI_INPUT_EXCLUDED_PLUGINS,
  MULTI_TURN_STRATEGIES,
  PLUGIN_CATEGORIES,
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

function normalizePluginId(pluginId: string): string {
  return pluginId.replace(/^promptfoo:redteam:/, '');
}

function getRuntimeStrategyKey(strategy: RedteamStrategyObject): string {
  if (strategy.id === 'layer' && strategy.config) {
    if (typeof strategy.config.label === 'string' && strategy.config.label.trim()) {
      return `layer/${strategy.config.label}`;
    }
    if (Array.isArray(strategy.config.steps)) {
      const steps = (strategy.config.steps as Array<string | { id?: string }>).map((step) =>
        typeof step === 'string' ? step : (step?.id ?? 'unknown'),
      );
      return `layer:${steps.join('->')}`;
    }
  }
  return strategy.id;
}

function stringifyCompatibilityConfig(value: unknown): string {
  const active = new WeakSet<object>();
  const memoized = new WeakMap<object, string>();
  const interned = new Map<string, string>();
  const definitions: string[] = [];

  const encode = (current: unknown, arrayValue = false): string | undefined => {
    if (!current || typeof current !== 'object') {
      const primitive = JSON.stringify(current);
      return primitive === undefined ? (arrayValue ? 'null' : undefined) : `p:${primitive}`;
    }
    if (active.has(current)) {
      throw new TypeError('Circular compatibility config');
    }
    const memoizedToken = memoized.get(current);
    if (memoizedToken) {
      return memoizedToken;
    }

    active.add(current);
    const entries = Array.isArray(current)
      ? current.map((item) => encode(item, true) ?? 'null')
      : Object.keys(current).flatMap((key) => {
          const encoded = encode((current as Record<string, unknown>)[key]);
          return encoded === undefined ? [] : [`${JSON.stringify(key)}:${encoded}`];
        });
    active.delete(current);

    const signature = `${Array.isArray(current) ? 'a' : 'o'}:${entries.join(',')}`;
    let token = interned.get(signature);
    if (!token) {
      token = `#${definitions.length}`;
      interned.set(signature, token);
      definitions.push(signature);
    }
    memoized.set(current, token);
    return token;
  };

  const root = encode(value) ?? 'undefined';
  return JSON.stringify([root, definitions]);
}

export function getEffectiveStrategiesForCompatibility(
  strategies: readonly unknown[],
): RedteamStrategyObject[] {
  const configNormalized = new Map<string, RedteamStrategyObject>();
  for (const [index, value] of strategies.entries()) {
    const strategy =
      typeof value === 'string'
        ? { id: value }
        : value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            typeof (value as { id?: unknown }).id === 'string'
          ? (value as RedteamStrategyObject)
          : undefined;
    if (!strategy) {
      continue;
    }

    let key = strategy.id;
    try {
      if (strategy.id === 'layer' && strategy.config?.label) {
        key = `layer/${strategy.config.label}`;
      } else if (strategy.id === 'layer' && strategy.config?.steps) {
        key = `layer:${stringifyCompatibilityConfig(strategy.config.steps)}`;
      } else if (strategy.config && Object.keys(strategy.config).length > 0) {
        key = `${strategy.id}:${stringifyCompatibilityConfig(strategy.config)}`;
      }
    } catch {
      key = `${strategy.id}:unserializable:${index}`;
    }
    configNormalized.set(key, strategy);
  }

  const seen = new Set<string>();
  return [...configNormalized.values()].filter((strategy) => {
    const key = getRuntimeStrategyKey(strategy);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function isExpandablePluginId(pluginId: string): boolean {
  return (
    COLLECTIONS.includes(pluginId as (typeof COLLECTIONS)[number]) ||
    ALIASED_PLUGINS.includes(pluginId as (typeof ALIASED_PLUGINS)[number])
  );
}

function getDirectPluginExpansion(pluginId: string): readonly string[] | undefined {
  const completeMapping = ALIASED_PLUGIN_MAPPINGS[pluginId];
  if (completeMapping) {
    return Object.values(completeMapping).flatMap((mapping) => mapping.plugins);
  }
  for (const mapping of Object.values(ALIASED_PLUGIN_MAPPINGS)) {
    if (mapping[pluginId]) {
      return mapping[pluginId].plugins;
    }
  }
  const category = PLUGIN_CATEGORIES[pluginId as keyof typeof PLUGIN_CATEGORIES];
  if (category) {
    return category;
  }
  if (pluginId === 'default') {
    return [...DEFAULT_PLUGINS];
  }
  if (pluginId === 'foundation') {
    return FOUNDATION_PLUGINS;
  }
  if (pluginId === 'guardrails-eval') {
    return GUARDRAILS_EVALUATION_PLUGINS;
  }
  return undefined;
}

function expandConfiguredPlugin(pluginId: string): readonly string[] | undefined {
  const initialExpansion = getDirectPluginExpansion(pluginId);
  if (!initialExpansion) {
    return undefined;
  }

  const expanded: string[] = [];
  const pending = [...initialExpansion];
  const visited = new Set([pluginId]);
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const nestedExpansion = getDirectPluginExpansion(current);
    if (nestedExpansion) {
      pending.push(...nestedExpansion);
    } else {
      expanded.push(current);
    }
  }
  return expanded;
}

export function pluginConfigMatchesStrategyTargets(
  pluginId: string,
  pluginConfig: unknown,
  strategyId: string,
  targetPlugins?: readonly string[],
): boolean {
  const normalizedPluginId = normalizePluginId(pluginId);
  if (
    STRATEGY_EXEMPT_PLUGINS.includes(normalizedPluginId as (typeof STRATEGY_EXEMPT_PLUGINS)[number])
  ) {
    return false;
  }
  if (
    normalizedPluginId.startsWith('coding-agent:') &&
    CANARY_BREAKING_STRATEGY_IDS.includes(
      strategyId as (typeof CANARY_BREAKING_STRATEGY_IDS)[number],
    )
  ) {
    return false;
  }
  if (
    normalizedPluginId === 'cross-session-leak' &&
    MULTI_TURN_STRATEGIES.includes(strategyId as (typeof MULTI_TURN_STRATEGIES)[number])
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
    targetPlugins.some(
      (target) => target === normalizedPluginId || normalizedPluginId.startsWith(`${target}:`),
    )
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

type LayerVisitState = WeakMap<object, Set<string>>;

function visitLayerOnce(
  visitedLayers: LayerVisitState,
  layer: object,
  targets: readonly string[] | undefined,
): boolean {
  const key = targets ? stringifyCompatibilityConfig(targets) : '';
  const targetKeys = visitedLayers.get(layer);
  if (targetKeys?.has(key)) {
    return false;
  }
  if (targetKeys) {
    targetKeys.add(key);
  } else {
    visitedLayers.set(layer, new Set([key]));
  }
  return true;
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
  visitedLayers: LayerVisitState,
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
    if (
      nestedSteps.length === 0 ||
      activeLayers.has(step.node) ||
      !visitLayerOnce(visitedLayers, step.node, step.targets)
    ) {
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
  const visitedLayers: LayerVisitState = new WeakMap();
  if (rootLayer) {
    activeLayers.add(rootLayer);
    visitLayerOnce(visitedLayers, rootLayer, inheritedTargets);
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
        visitedLayers,
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
      if (!visitLayerOnce(visitedLayers, step.node, step.targets)) {
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

/** Resolve configured collections before checking Posterior compatibility for multi-input mode. */
export function configuredPluginHasApplicablePosteriorForMultiInput(
  pluginId: string,
  pluginConfig: unknown,
  strategy: RedteamStrategyObject,
  options: { pluginsUseTargetInputs?: boolean } = {},
): boolean {
  const normalizedPluginId = normalizePluginId(pluginId);
  if (isSequenceOnlyIntentPlugin(pluginId, pluginConfig)) {
    return false;
  }

  const expansion = expandConfiguredPlugin(normalizedPluginId);
  const expandedPluginIds = expansion ?? [normalizedPluginId];
  return expandedPluginIds.some(
    (expandedPluginId) =>
      (options.pluginsUseTargetInputs === false ||
        !MULTI_INPUT_EXCLUDED_PLUGINS.includes(
          expandedPluginId as (typeof MULTI_INPUT_EXCLUDED_PLUGINS)[number],
        )) &&
      pluginConfigHasApplicablePosterior(expandedPluginId, pluginConfig, strategy),
  );
}

export function isSequenceOnlyIntentPlugin(pluginId: string, pluginConfig: unknown): boolean {
  return (
    normalizePluginId(pluginId) === 'intent' &&
    typeof pluginConfig === 'object' &&
    pluginConfig !== null &&
    Array.isArray((pluginConfig as { intent?: unknown }).intent) &&
    (pluginConfig as { intent: unknown[] }).intent.every(Array.isArray)
  );
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
