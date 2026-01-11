import type { TestCase } from '../../types/index';

export function addCrescendo(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    // Get inputs from plugin config if available
    const pluginConfig = testCase.metadata?.pluginConfig as Record<string, unknown> | undefined;
    const inputs = pluginConfig?.inputs as Record<string, string> | undefined;

    return {
      ...testCase,
      provider: {
        id: 'promptfoo:redteam:crescendo',
        config: {
          injectVar,
          ...config,
          // Pass inputs from plugin config to crescendo provider
          ...(inputs && { inputs }),
        },
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/Crescendo`,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId: 'crescendo',
        originalText,
      },
    };
  });
}
