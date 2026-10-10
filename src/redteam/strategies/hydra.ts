import { appendMetricSuffix } from './assertions';

import type { TestCase } from '../../types/index';
import type { Inputs } from '../../types/shared';

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
 * Creates the shared test-case transformer used by multi-turn strategies.
 */
export function createAdaptiveMultiTurnStrategy(
  definition: AdaptiveMultiTurnStrategyDefinition,
  generateScanId = true,
): AdaptiveMultiTurnStrategy {
  const { providerName, metricSuffix, strategyId } = definition;

  return (testCases, injectVar, config) => {
    const scanId = generateScanId ? crypto.randomUUID() : undefined; // Generate once for all tests in this scan

    return testCases.map((testCase) => {
      const originalText = String(testCase.vars![injectVar]);
      // Get inputs from plugin config if available
      const pluginConfig = testCase.metadata?.pluginConfig as Record<string, unknown> | undefined;
      const inputs = pluginConfig?.inputs as Inputs | undefined;

      return {
        ...testCase,
        provider: {
          id: providerName,
          config: {
            injectVar,
            ...(generateScanId ? { scanId } : {}),
            ...config,
            // Pass inputs from plugin config to the selected provider
            ...(inputs && { inputs }),
          },
        },
        assert: appendMetricSuffix(testCase, metricSuffix),
        metadata: {
          ...testCase.metadata,
          strategyId,
          originalText,
        },
      };
    });
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
