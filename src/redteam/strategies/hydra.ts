import type { TestCase } from '../../types/index';

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
    const originalText = String(testCase.vars![injectVar]);
    // Get inputs from plugin config if available
    const pluginConfig = testCase.metadata?.pluginConfig as Record<string, unknown> | undefined;
    const inputs = pluginConfig?.inputs as Record<string, string> | undefined;

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
        metric: `${assertion.metric}/${metricSuffix}`,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId,
        originalText,
      },
    };
  });
}
