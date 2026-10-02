import { addProviderTestCases } from './testCaseAdapters';

import type { TestCase } from '../../types/index';

interface AdaptiveMultiTurnStrategyDefinition {
  providerName: string;
  metricSuffix: string;
  strategyId: string;
}

type AdaptiveMultiTurnStrategy = (
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
) => TestCase[];

/**
 * Creates the shared test-case transformer used by Hydra-compatible multi-turn strategies.
 */
export function createAdaptiveMultiTurnStrategy(
  definition: AdaptiveMultiTurnStrategyDefinition,
): AdaptiveMultiTurnStrategy {
  const { providerName, metricSuffix, strategyId } = definition;

  return (testCases, injectVar, config) => {
    const scanId = crypto.randomUUID(); // Generate once for all tests in this scan

    return addProviderTestCases(
      testCases,
      injectVar,
      { scanId, ...config },
      {
        providerName,
        metricSuffix,
        strategyId,
        forwardPluginInputs: true,
      },
    );
  };
}

export function addHydra(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return createAdaptiveMultiTurnStrategy({
    providerName: 'promptfoo:redteam:hydra',
    metricSuffix: 'Hydra',
    strategyId: 'jailbreak:hydra',
  })(testCases, injectVar, config);
}
