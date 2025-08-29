import type { TestCase } from '../../types';

export function addCrescendo(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      provider: {
        id: 'promptfoo:redteam:crescendo',
        config: {
          injectVar,
          ...config,
          ...(config && (config as any).redteamProvider
            ? { redteamProvider: (config as any).redteamProvider }
            : {}),
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
