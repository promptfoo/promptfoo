import { appendMetricSuffix } from './assertions';

import type { TestCase } from '../../types/index';
import type { Inputs } from '../../types/shared';

interface AdaptiveMultiTurnStrategyDefinition {
  providerName: string;
  metricSuffix: string;
  strategyId: string;
  defaults?: Record<string, unknown>;
  forwardPluginInputs?: boolean;
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
  const {
    providerName,
    metricSuffix,
    strategyId,
    defaults,
    forwardPluginInputs = true,
  } = definition;

  return (testCases, injectVar, config) => {
    const scanId = generateScanId ? crypto.randomUUID() : undefined; // Generate once for all tests in this scan

    return testCases.map((testCase) => {
      const originalText = String(testCase.vars![injectVar]);
      const metadata: TestCase['metadata'] = { ...testCase.metadata, strategyId, originalText };
      const inputs = forwardPluginInputs
        ? (metadata.pluginConfig as { inputs?: Inputs } | undefined)?.inputs
        : undefined;

      return {
        ...testCase,
        provider: {
          id: providerName,
          config: {
            injectVar,
            ...(generateScanId ? { scanId } : {}),
            ...defaults,
            ...config,
            // Pass inputs from plugin config to the selected provider
            ...(inputs && { inputs }),
          },
        },
        assert: appendMetricSuffix(testCase, metricSuffix),
        metadata,
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
