import type { TestCase } from '../../types/index';

export function addIterativeJailbreaks(
  testCases: TestCase[],
  injectVar: string,
  strategy: 'iterative' | 'iterative:tree' | 'iterative:meta' = 'iterative',
  config: Record<string, any>,
): TestCase[] {
  const providerName =
    strategy === 'iterative'
      ? 'promptfoo:redteam:iterative'
      : strategy === 'iterative:tree'
        ? 'promptfoo:redteam:iterative:tree'
        : 'promptfoo:redteam:iterative:meta';

  const metricSuffix =
    strategy === 'iterative'
      ? 'Iterative'
      : strategy === 'iterative:tree'
        ? 'IterativeTree'
        : 'IterativeMeta';

  const strategyId =
    strategy === 'iterative'
      ? 'jailbreak'
      : strategy === 'iterative:tree'
        ? 'jailbreak:tree'
        : 'jailbreak:meta';

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
          ...config,
          // Pass inputs from plugin config to iterative provider
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
