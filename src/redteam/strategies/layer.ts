import logger from '../../logger';
import { getAttackProviderFullId, isAttackProvider } from '../shared/attackProviders';
import { pluginMatchesStrategyTargets } from './util';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';
import type { LayerConfig } from '../shared/runtimeTransform';
import type { Strategy } from './types';

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

      // Get the full provider ID
      const providerId = getAttackProviderFullId(stepObj.id);
      const metricSuffix = getMetricSuffix(stepObj.id);
      const label = typeof config?.label === 'string' ? config.label : undefined;
      const strategyId = getStrategyId(stepObj.id, perTurnLayers, label);
      const scanId = crypto.randomUUID();

      logger.debug(`layer strategy: configuring attack provider`, {
        providerId,
        perTurnLayers: perTurnLayers.map((l) => (typeof l === 'string' ? l : l.id)),
        testCaseCount: current.length,
      });

      // Transform current test cases to use the attack provider
      // with per-turn layers configured
      return current.map((testCase) => {
        const originalText = String(testCase.vars?.[injectVar] ?? '');
        return {
          ...testCase,
          provider: {
            id: providerId,
            config: {
              injectVar,
              scanId,
              ...stepObj.config,
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

    const next = await stepAction(applicable, injectVar, {
      ...(stepObj.config || {}),
      ...(config || {}),
    });

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
