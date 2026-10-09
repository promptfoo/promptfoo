import logger from '../../logger';
import { remoteGenerationContextPayload } from '../remoteGenerationContext';
import { getAttackProviderFullId, isAttackProvider } from '../shared/attackProviders';
import { addIterativeJailbreaks } from './iterative';
import { withPersistableGenerationProvider } from './types';
import { pluginMatchesStrategyTargets } from './util';

import type { ProviderOptions, TestCase, TestCaseWithPlugin } from '../../types/index';
import type { LayerConfig } from '../shared/runtimeTransform';
import type { Strategy, StrategyRuntimeContext } from './types';

/**
 * Adds layer test cases by composing strategies in order.
 *
 * When an attack provider (hydra, crescendo, etc.) is encountered in the steps,
 * the remaining steps become per-turn transforms that are applied to each turn's
 * output before sending to the target.
 *
 * @example
 * ```yaml
 * # Regular layer composition (pre-eval transforms)
 * strategies:
 *   - id: layer
 *     config:
 *       steps: [jailbreak, base64]
 *
 * # Attack provider with per-turn transforms
 * strategies:
 *   - id: layer
 *     config:
 *       steps: [hydra, audio]  # audio applied to each Hydra turn
 *
 * # Mixed: pre-eval + attack provider + per-turn
 * strategies:
 *   - id: layer
 *     config:
 *       steps: [jailbreak, hydra, audio]
 *       # jailbreak applied to initial test cases
 *       # audio applied to each Hydra turn
 * ```
 */
export async function addLayerTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
  strategies: Strategy[],
  loadStrategy: (strategyPath: string) => Promise<Strategy>,
  runtimeContext?: StrategyRuntimeContext,
): Promise<TestCase[]> {
  // Compose strategies in-order. Config example:
  // { steps: [ 'base64', { id: 'rot13' } ] }
  const steps: Array<string | { id: string; config?: Record<string, unknown> }> = Array.isArray(
    config?.steps,
  )
    ? config.steps
    : [];

  if (steps.length === 0) {
    logger.warn('layer strategy: no steps provided; returning empty');
    return [];
  }

  let current: TestCaseWithPlugin[] = testCases;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepObj = typeof step === 'string' ? { id: step } : step;
    const attackProvider = isAttackProvider(stepObj.id);
    const actionId = attackProvider ? getAttackStrategyId(stepObj.id) : stepObj.id;
    let stepAction: Strategy['action'] | undefined;

    try {
      if (attackProvider && actionId === 'jailbreak') {
        // Layer's legacy jailbreak step uses iterative, unlike the top-level meta alias.
        stepAction = async (tests, variable, options) =>
          addIterativeJailbreaks(tests, variable, 'iterative', options);
      } else if (stepObj.id.startsWith('file://')) {
        stepAction = (await loadStrategy(stepObj.id)).action;
      } else {
        const builtin =
          strategies.find((strategy) => strategy.id === actionId) ||
          strategies.find((strategy) => strategy.id === actionId.split(':')[0]);
        stepAction = builtin?.action;
      }
    } catch (e) {
      logger.error(`layer strategy: error loading step ${stepObj.id}: ${e}`);
    }

    if (!stepAction) {
      logger.warn(`layer strategy: step ${stepObj.id} not registered, skipping`);
      continue;
    }

    const stepTargets = stepObj.config?.plugins ?? config?.plugins;
    const applicable = current.filter(
      (test) =>
        pluginMatchesStrategyTargets(test, stepObj.id, stepTargets as string[] | undefined) &&
        (!attackProvider ||
          pluginMatchesStrategyTargets(test, actionId, stepTargets as string[] | undefined)),
    );

    if (attackProvider) {
      const perTurnLayers: LayerConfig[] = steps
        .slice(i + 1)
        .map((remaining) =>
          typeof remaining === 'string'
            ? remaining
            : { id: remaining.id, config: remaining.config },
        );
      const providerId = getAttackProviderFullId(stepObj.id.replace('promptfoo:redteam:', ''));
      const persistProvider = [
        'promptfoo:redteam:crescendo',
        'promptfoo:redteam:custom',
        'promptfoo:redteam:iterative',
        'promptfoo:redteam:iterative:meta',
        'promptfoo:redteam:iterative:tree',
      ].includes(providerId);
      const scanId = crypto.randomUUID();
      const label = typeof config?.label === 'string' ? config.label : undefined;
      const strategyId = getStrategyId(stepObj.id, perTurnLayers, label);
      const metricSuffix = getMetricSuffix(stepObj.id);
      const action = stepAction;

      return Promise.all(
        applicable.map(async (originalTest) => {
          const options: Record<string, unknown> = {
            scanId,
            ...(persistProvider
              ? withPersistableGenerationProvider(stepObj.config || {}, runtimeContext)
              : stepObj.config),
            ...remoteGenerationContextPayload(
              typeof config?.targetId === 'string' ? config.targetId : undefined,
            ),
            ...(perTurnLayers.length > 0 && { _perTurnLayers: perTurnLayers }),
          };
          const [test] = await action(
            [originalTest.vars ? originalTest : { ...originalTest, vars: {} }],
            injectVar,
            options,
            actionId,
            runtimeContext,
          );
          // Layers retain explicit step inputs; plugin metadata does not enable provider inputs.
          const providerConfig = (test.provider as ProviderOptions).config!;
          delete providerConfig.inputs;
          if (Object.prototype.hasOwnProperty.call(options, 'inputs')) {
            providerConfig.inputs = options.inputs;
          }
          return {
            ...test,
            vars: originalTest.vars,
            assert: originalTest.assert?.map((assertion) => ({
              ...assertion,
              metric: assertion.metric ? `${assertion.metric}/${metricSuffix}` : assertion.metric,
            })),
            metadata: {
              ...test.metadata,
              strategyId,
              originalText: String(originalTest.vars?.[injectVar] ?? ''),
            },
          };
        }),
      );
    }

    const stepConfig = { ...(stepObj.config || {}), ...(config || {}) };
    const next = runtimeContext
      ? await stepAction(applicable, injectVar, stepConfig, undefined, runtimeContext)
      : await stepAction(applicable, injectVar, stepConfig);
    current = next as TestCaseWithPlugin[];
  }

  return current;
}

function getAttackStrategyId(stepId: string): string {
  const normalized = stepId.replace('promptfoo:redteam:', '');
  const provider = getAttackProviderFullId(normalized).replace('promptfoo:redteam:', '');
  if (provider === 'iterative') {
    return 'jailbreak';
  }
  if (provider.startsWith('iterative:')) {
    return provider.replace('iterative:', 'jailbreak:');
  }
  if (provider === 'hydra' || provider === 'goblin') {
    return `jailbreak:${provider}`;
  }
  return normalized.startsWith('custom:') ? normalized : provider;
}

/**
 * Gets the metric suffix for an attack provider.
 */
function getMetricSuffix(stepId: string): string {
  const baseId = stepId.replace('promptfoo:redteam:', '').replace('jailbreak:', '');
  const suffixMap: Record<string, string> = {
    // Multi-turn conversational strategies
    hydra: 'Hydra',
    goblin: 'Goblin',
    crescendo: 'Crescendo',
    goat: 'GOAT',
    custom: 'Custom',
    // Multi-attempt single-turn strategies
    iterative: 'Iterative',
    'iterative:meta': 'Meta',
    'iterative:tree': 'Tree',
  };
  return suffixMap[baseId] || baseId.charAt(0).toUpperCase() + baseId.slice(1);
}

/**
 * Gets the strategy ID for an attack provider with per-turn layers.
 * If a label is provided in the config, it's included for display.
 */
function getStrategyId(stepId: string, perTurnLayers: LayerConfig[], label?: string): string {
  const baseId = stepId.includes(':') ? stepId : `jailbreak:${stepId}`;
  const labelPrefix = label ? `layer/${label}:` : '';
  if (perTurnLayers.length === 0) {
    return `${labelPrefix}${baseId}`;
  }
  const layerIds = perTurnLayers.map((l) => (typeof l === 'string' ? l : l.id)).join('/');
  return `${labelPrefix}${baseId}/${layerIds}`;
}
