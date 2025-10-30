import type { TestCase } from '../../types/index';

export function addIterativeJailbreaks(
  testCases: TestCase[],
  injectVar: string,
  strategy:
    | 'iterative'
    | 'iterative:tree'
    | 'iterative:meta'
    | 'iterative:websearch'
    | 'iterative:tools' = 'iterative',
  config: Record<string, any>,
): TestCase[] {
  const providerName =
    strategy === 'iterative'
      ? 'promptfoo:redteam:iterative'
      : strategy === 'iterative:tree'
        ? 'promptfoo:redteam:iterative:tree'
        : strategy === 'iterative:meta'
          ? 'promptfoo:redteam:iterative:meta'
          : strategy === 'iterative:websearch'
            ? 'promptfoo:redteam:iterative:websearch'
            : 'promptfoo:redteam:iterative:tools';

  const metricSuffix =
    strategy === 'iterative'
      ? 'Iterative'
      : strategy === 'iterative:tree'
        ? 'IterativeTree'
        : strategy === 'iterative:meta'
          ? 'IterativeMeta'
          : strategy === 'iterative:websearch'
            ? 'IterativeWebsearch'
            : 'IterativeTools';

  const strategyId =
    strategy === 'iterative'
      ? 'jailbreak'
      : strategy === 'iterative:tree'
        ? 'jailbreak:tree'
        : strategy === 'iterative:meta'
          ? 'jailbreak:meta'
          : strategy === 'iterative:websearch'
            ? 'jailbreak:websearch'
            : 'jailbreak:iterative-tools';

  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      provider: {
        id: providerName,
        config: {
          injectVar,
          ...config,
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
