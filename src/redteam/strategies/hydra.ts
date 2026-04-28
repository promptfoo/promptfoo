import { getAgenticAttackProfile } from '../agenticProfile';

import type { TestCase } from '../../types/index';
import type { Inputs } from '../../types/shared';

export function addHydra(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  const providerName = 'promptfoo:redteam:hydra';
  const metricSuffix = 'Hydra';
  const strategyId = 'jailbreak:hydra';
  const scanId = crypto.randomUUID(); // Generate once for all tests in this scan

  return testCases.map((testCase) => {
    const { redteamProvider: _redteamProvider, ...providerConfig } = config;
    const originalText = String(testCase.vars![injectVar]);
    // Get inputs from plugin config if available
    const pluginConfig = testCase.metadata?.pluginConfig as Record<string, unknown> | undefined;
    const inputs = pluginConfig?.inputs as Inputs | undefined;
    const agenticAttackProfile = getAgenticAttackProfile(testCase.metadata);
    const hydraHints = agenticAttackProfile?.strategyHints?.hydra;
    const sendCurrentTurnOnly = config.sendCurrentTurnOnly ?? hydraHints?.sendCurrentTurnOnly;

    return {
      ...testCase,
      provider: {
        id: providerName,
        config: {
          injectVar,
          scanId,
          ...providerConfig,
          // Pass inputs from plugin config to Hydra provider
          ...(inputs && { inputs }),
          ...(sendCurrentTurnOnly === undefined ? {} : { sendCurrentTurnOnly }),
        },
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/${metricSuffix}`,
      })),
      metadata: {
        ...testCase.metadata,
        ...(agenticAttackProfile && !testCase.metadata?.agenticAttackProfile
          ? { agenticAttackProfile }
          : {}),
        strategyId,
        originalText,
      },
    };
  });
}
