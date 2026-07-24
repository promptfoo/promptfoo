import logger from '../../logger';
import { remoteGenerationContextPayload } from '../remoteGenerationContext';
import { getAttackProviderFullId, isAttackProvider } from '../shared/attackProviders';
import { wouldUnicodeNormalizationChange } from './unicodeNormalization';
import { pluginMatchesStrategyTargets } from './util';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';
import type { LayerConfig } from '../shared/runtimeTransform';
import type { Strategy } from './types';

interface LayerTestCaseState {
  testCase: TestCaseWithPlugin;
  /** Whether at least one step has materially transformed this path. */
  transformed: boolean;
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

  let current: LayerTestCaseState[] = testCases.map((testCase) => ({
    testCase,
    transformed: false,
  }));

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

      // Collect remaining steps. Applicability is resolved per test case below so
      // plugin-level exclusions (including coding-agent canary protection) cannot
      // be bypassed by nesting a strategy after an attack provider.
      const remainingSteps = steps.slice(i + 1);

      // Get the full provider ID
      const providerId = getAttackProviderFullId(stepObj.id);
      const metricSuffix = getMetricSuffix(stepObj.id);
      const label = typeof config?.label === 'string' ? config.label : undefined;
      const scanId = crypto.randomUUID();

      logger.debug(`layer strategy: configuring attack provider`, {
        providerId,
        perTurnLayers: remainingSteps.map((layer) =>
          typeof layer === 'string' ? layer : layer.id,
        ),
        testCaseCount: current.length,
      });

      // Transform current test cases to use the attack provider
      // with per-turn layers configured
      return current.map(({ testCase }) => {
        const applicablePerTurnSteps = remainingSteps.filter((layer) => {
          const layerObj = typeof layer === 'string' ? { id: layer } : layer;
          const layerTargets =
            (layerObj.config as Record<string, unknown> | undefined)?.plugins ?? config?.plugins;
          return pluginMatchesStrategyTargets(
            testCase,
            layerObj.id,
            layerTargets as string[] | undefined,
          );
        });
        const perTurnLayers: LayerConfig[] = applicablePerTurnSteps.map((layer) =>
          typeof layer === 'string' ? layer : { id: layer.id, config: layer.config },
        );
        const strategyId = getStrategyId(stepObj.id, perTurnLayers, label);
        const originalText = String(testCase.vars?.[injectVar] ?? '');
        return {
          ...testCase,
          provider: {
            id: providerId,
            config: {
              injectVar,
              scanId,
              ...stepObj.config,
              ...remoteGenerationContextPayload(
                typeof config?.targetId === 'string' ? config.targetId : undefined,
              ),
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
    const applicable = current.filter(({ testCase }) =>
      pluginMatchesStrategyTargets(testCase, stepObj.id, stepTargets as string[] | undefined),
    );

    if (stepObj.id === 'unicode-normalization') {
      const stepConfig = {
        ...(stepObj.config || {}),
        ...(config || {}),
      };
      const changeMask = applicable.map(({ testCase }) =>
        wouldUnicodeNormalizationChange(testCase, injectVar, stepConfig),
      );
      const changeCandidates = applicable
        .filter((_, index) => changeMask[index])
        .map(({ testCase }) => testCase);
      const transformedCases = await stepAction(changeCandidates, injectVar, stepConfig);
      let transformedIndex = 0;

      // Unicode deliberately filters byte-for-byte no-ops. Keep those paths only
      // inside the layer pipeline so a later step can still transform them. They
      // are removed from the final output if no step ever changes them.
      current = applicable.flatMap((state, index): LayerTestCaseState[] => {
        if (!changeMask[index]) {
          return [state];
        }

        const transformedCase = transformedCases[transformedIndex++];
        return transformedCase
          ? [{ testCase: transformedCase as TestCaseWithPlugin, transformed: true }]
          : [];
      });
      continue;
    }

    const next = await stepAction(
      applicable.map(({ testCase }) => testCase),
      injectVar,
      {
        ...(stepObj.config || {}),
        ...(config || {}),
      },
    );

    // Feed output to next step. If a step yields nothing, subsequent steps operate on empty set.
    current = next.map((testCase) => ({
      testCase: testCase as TestCaseWithPlugin,
      transformed: true,
    }));
  }

  return current.filter(({ transformed }) => transformed).map(({ testCase }) => testCase);
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
