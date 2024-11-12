import type { TestCase } from '../../types';

export function addIterativeJailbreaks(
  testCases: TestCase[],
  injectVar: string,
  strategy: 'iterative' | 'iterative:tree' = 'iterative',
  config: Record<string, any>,
): TestCase[] {
  const providerName =
    strategy === 'iterative' ? 'promptfoo:redteam:iterative' : 'promptfoo:redteam:iterative:tree';
  return testCases.map((testCase) => ({
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
      metric: `${assertion.metric}/${strategy === 'iterative' ? 'Iterative' : 'IterativeTree'}`,
    })),
  }));
}
