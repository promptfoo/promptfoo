import { TestCase } from '../../types';

export function addIterativeJailbreaks(
  testCases: TestCase[],
  strategy: 'iterative' | 'iterative:tree' = 'iterative',
): TestCase[] {
  const providerName =
    strategy === 'iterative' ? 'promptfoo:redteam:iterative' : 'promptfoo:redteam:iterative:tree';
  return testCases.map((testCase) => ({
    ...testCase,
    provider: providerName,
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/${strategy === 'iterative' ? 'Iterative' : 'IterativeTree'}`,
    })),
  }));
}
