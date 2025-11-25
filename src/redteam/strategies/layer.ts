import logger from '../../logger';
import { pluginMatchesStrategyTargets } from './util';

import type { Strategy } from './types';
import type { TestCase, TestCaseWithPlugin } from '../../types/index';

export async function addLayerTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, any>,
  strategies: Strategy[],
  loadStrategy: (strategyPath: string) => Promise<Strategy>,
): Promise<TestCase[]> {
  // Compose strategies in-order. Config example:
  // { steps: [ 'base64', { id: 'rot13' } ] }
  const steps: Array<string | { id: string; config?: Record<string, any> }> = Array.isArray(
    config?.steps,
  )
    ? config.steps
    : [];

  if (steps.length === 0) {
    logger.warn('layer strategy: no steps provided; returning empty');
    return [];
  }

  let current: TestCaseWithPlugin[] = testCases;

  for (const step of steps) {
    const stepObj = typeof step === 'string' ? { id: step } : step;
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
    const stepTargets = stepObj.config?.plugins ?? config?.plugins;
    const applicable = current.filter((t) =>
      pluginMatchesStrategyTargets(t, stepObj.id, stepTargets),
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
