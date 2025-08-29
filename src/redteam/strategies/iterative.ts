import type { TestCase } from '../../types';

export function addIterativeJailbreaks(
  testCases: TestCase[],
  injectVar: string,
  strategy: 'iterative' | 'iterative:tree' = 'iterative',
  config: Record<string, any>,
): TestCase[] {
  const providerName =
    strategy === 'iterative' ? 'promptfoo:redteam:iterative' : 'promptfoo:redteam:iterative:tree';
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      provider: {
        id: providerName,
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
        metric: `${assertion.metric}/${strategy === 'iterative' ? 'Iterative' : 'IterativeTree'}`,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId: strategy === 'iterative' ? 'jailbreak' : 'jailbreak:tree',
        originalText,
      },
    };
  });
}
