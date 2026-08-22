import logger from '../../logger';
import { MULTI_INPUT_VAR } from '../constants/plugins';
import { TEXT_MUTATION_STRATEGIES } from '../constants/strategies';
import { remoteGenerationContextPayload } from '../remoteGenerationContext';
import { getAttackProviderFullId, isAttackProvider } from '../shared/attackProviders';
import { resolveBijectionOptions } from './bijection';
import { mutateText } from './textMutation';
import { withPersistableGenerationProvider } from './types';
import { pluginMatchesStrategyTargets } from './util';

import type { Inputs, TestCase, TestCaseWithPlugin } from '../../types/index';
import type { TextMutationStrategy } from '../constants/strategies';
import type { LayerConfig } from '../shared/runtimeTransform';
import type { Strategy, StrategyRuntimeContext } from './types';

const MULTI_INPUT_TEXT_LAYERS = new Set<string>([
  ...TEXT_MUTATION_STRATEGIES,
  'homoglyph',
  'bijection',
]);
const MULTI_INPUT_TEXT_LAYER_PROVIDERS = new Set([
  'promptfoo:redteam:iterative',
  'promptfoo:redteam:iterative:meta',
]);

function assertCompatibleMultiInputLayers(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  steps: LayerConfig[],
): void {
  if (
    injectVar === MULTI_INPUT_VAR &&
    testCases.some((testCase) => Boolean(testCase.metadata?.pluginConfig?.inputs)) &&
    steps.some((step) => MULTI_INPUT_TEXT_LAYERS.has(typeof step === 'string' ? step : step.id)) &&
    steps.some((step) => {
      const stepId = typeof step === 'string' ? step : step.id;
      return !MULTI_INPUT_TEXT_LAYERS.has(stepId) && !isAttackProvider(stepId);
    })
  ) {
    throw new Error(
      'Multi-input text-mutation layers cannot be combined with whole-prompt strategies.',
    );
  }
}

function validatePerTurnMutationLayers(layers: LayerConfig[]): void {
  for (const layer of layers) {
    const layerId = typeof layer === 'string' ? layer : layer.id;
    const layerConfig = typeof layer === 'string' ? {} : (layer.config ?? {});

    if (layerId === 'bijection') {
      if (resolveBijectionOptions(layerConfig).n > 1) {
        throw new Error(
          'The bijection strategy n must be 1 when used as a per-turn layer; use a standalone bijection strategy for multiple variants.',
        );
      }
    } else if (TEXT_MUTATION_STRATEGIES.includes(layerId as TextMutationStrategy)) {
      mutateText('', layerId as TextMutationStrategy, layerConfig);
    }
  }
}

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

  assertCompatibleMultiInputLayers(testCases, injectVar, steps);

  let current: TestCaseWithPlugin[] = testCases;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepObj = typeof step === 'string' ? { id: step } : step;

    // ═══════════════════════════════════════════════════════════════════════
    // CHECK: Is this an attack provider (hydra, crescendo, etc.)?
    // If so, remaining steps become per-turn transforms
    // ═══════════════════════════════════════════════════════════════════════
    if (isAttackProvider(stepObj.id)) {
      logger.debug(
        `layer strategy: detected attack provider '${stepObj.id}' at step ${i}, remaining steps will be per-turn transforms`,
      );

      // Collect remaining steps as per-turn layer configs
      const remainingSteps = steps.slice(i + 1);
      const perTurnLayers: LayerConfig[] = remainingSteps.map((s) =>
        typeof s === 'string' ? s : { id: s.id, config: s.config },
      );
      validatePerTurnMutationLayers(perTurnLayers);
      const applicableTestCases = current.filter((testCase) =>
        perTurnLayers.every((layer) => {
          const layerId = typeof layer === 'string' ? layer : layer.id;
          const targetPlugins =
            (typeof layer === 'string' ? undefined : layer.config?.plugins) ?? config?.plugins;
          return pluginMatchesStrategyTargets(
            testCase,
            layerId,
            targetPlugins as string[] | undefined,
          );
        }),
      );

      // Get the full provider ID
      const providerId = getAttackProviderFullId(stepObj.id);
      if (
        injectVar === MULTI_INPUT_VAR &&
        !MULTI_INPUT_TEXT_LAYER_PROVIDERS.has(providerId) &&
        perTurnLayers.some((layer) =>
          MULTI_INPUT_TEXT_LAYERS.has(typeof layer === 'string' ? layer : layer.id),
        ) &&
        applicableTestCases.some((testCase) => Boolean(testCase.metadata?.pluginConfig?.inputs))
      ) {
        throw new Error(
          `${stepObj.id} does not support multi-input text-mutation layers; use jailbreak or jailbreak:meta.`,
        );
      }
      const shouldPersistGenerationProvider = [
        'promptfoo:redteam:crescendo',
        'promptfoo:redteam:custom',
        'promptfoo:redteam:iterative',
        'promptfoo:redteam:iterative:meta',
        'promptfoo:redteam:iterative:tree',
      ].includes(providerId);
      const metricSuffix = getMetricSuffix(stepObj.id);
      const label = typeof config?.label === 'string' ? config.label : undefined;
      const strategyId = getStrategyId(stepObj.id, perTurnLayers, label);
      const scanId = crypto.randomUUID();

      logger.debug(`layer strategy: configuring attack provider`, {
        providerId,
        perTurnLayers: perTurnLayers.map((l) => (typeof l === 'string' ? l : l.id)),
        testCaseCount: applicableTestCases.length,
      });

      // Transform current test cases to use the attack provider
      // with per-turn layers configured
      return applicableTestCases.map((testCase) => {
        const originalText = String(testCase.vars?.[injectVar] ?? '');
        const inputs = testCase.metadata?.pluginConfig?.inputs as Inputs | undefined;
        return {
          ...testCase,
          provider: {
            id: providerId,
            config: {
              injectVar,
              scanId,
              ...(shouldPersistGenerationProvider
                ? withPersistableGenerationProvider(stepObj.config || {}, runtimeContext)
                : stepObj.config),
              ...remoteGenerationContextPayload(
                typeof config?.targetId === 'string' ? config.targetId : undefined,
              ),
              ...(inputs && { inputs }),
              // Pass per-turn layers for runtime application
              ...(perTurnLayers.length > 0 && { _perTurnLayers: perTurnLayers }),
            },
          },
          assert: testCase.assert?.map((assertion) => ({
            ...assertion,
            metric: assertion.metric ? `${assertion.metric}/${metricSuffix}` : assertion.metric,
          })),
          metadata: {
            ...testCase.metadata,
            strategyId,
            originalText,
          },
        };
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REGULAR STRATEGY: Apply transform to test cases (existing behavior)
    // ═══════════════════════════════════════════════════════════════════════
    let stepAction: Strategy['action'] | undefined;

    try {
      if (stepObj.id.startsWith('file://')) {
        const loaded = await loadStrategy(stepObj.id);
        stepAction = loaded.action;
      } else {
        // Try exact match first, then base id before ':'
        let builtin = strategies.find((s) => s.id === stepObj.id);
        if (!builtin && stepObj.id.includes(':')) {
          const baseId = stepObj.id.split(':')[0];
          builtin = strategies.find((s) => s.id === baseId);
        }
        stepAction = builtin?.action;
      }
    } catch (e) {
      logger.error(`layer strategy: error loading step ${stepObj.id}: ${e}`);
      stepAction = undefined;
    }

    if (!stepAction) {
      logger.warn(`layer strategy: step ${stepObj.id} not registered, skipping`);
      continue;
    }

    // Determine applicable test cases for this step using the same targeting rules
    const stepTargets =
      (stepObj.config as Record<string, unknown>)?.plugins ?? (config?.plugins as unknown);
    const applicable = current.filter((t) =>
      pluginMatchesStrategyTargets(t, stepObj.id, stepTargets as string[] | undefined),
    );

    const stepConfig = {
      ...(stepObj.config || {}),
      ...(config || {}),
    };
    const next = runtimeContext
      ? await stepAction(applicable, injectVar, stepConfig, undefined, runtimeContext)
      : await stepAction(applicable, injectVar, stepConfig);

    // Feed output to next step. If a step yields nothing, subsequent steps operate on empty set.
    current = next as TestCaseWithPlugin[];
  }

  return current;
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
