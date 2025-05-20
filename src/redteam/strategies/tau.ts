import type { TestCase } from '../../types';

export function addTau(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'promptfoo:redteam:tau',
      config: {
        injectVar,
        ...config,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/Tau`,
    })),
    metadata: {
      ...testCase.metadata,
      strategyId: 'tau',
    },
  }));
}
