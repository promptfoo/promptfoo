import { getAgenticAttackProfile } from '../agenticProfile';

import type { ProviderOptions, TestCase } from '../../types/index';
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
 * Creates the shared test-case transformer used by Hydra-compatible multi-turn strategies.
 */
export function createAdaptiveMultiTurnStrategy(
  definition: AdaptiveMultiTurnStrategyDefinition,
): AdaptiveMultiTurnStrategy {
  const { providerName, metricSuffix, strategyId } = definition;

  return (testCases, injectVar, config) => {
    const scanId = crypto.randomUUID(); // Generate once for all tests in this scan

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
            scanId,
            ...config,
            // Pass inputs from plugin config to Hydra provider
            ...(inputs && { inputs }),
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
  };
}

export function addHydra(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  const { redteamProvider: _redteamProvider, ...providerConfig } = config;
  const transformed = createAdaptiveMultiTurnStrategy({
    providerName: 'promptfoo:redteam:hydra',
    metricSuffix: 'Hydra',
    strategyId: 'jailbreak:hydra',
  })(testCases, injectVar, providerConfig);

  return transformed.map((testCase) => {
    const agenticAttackProfile = getAgenticAttackProfile(testCase.metadata);
    if (!agenticAttackProfile) {
      return testCase;
    }
    const provider = testCase.provider as ProviderOptions;
    const sendCurrentTurnOnly =
      config.sendCurrentTurnOnly ?? agenticAttackProfile.strategyHints?.hydra?.sendCurrentTurnOnly;

    return {
      ...testCase,
      provider: {
        ...provider,
        config: {
          ...provider.config,
          ...(sendCurrentTurnOnly === undefined ? {} : { sendCurrentTurnOnly }),
        },
      },
      metadata: {
        ...testCase.metadata,
        ...(testCase.metadata?.agenticAttackProfile ? {} : { agenticAttackProfile }),
      },
    };
  });
}
