import type { TestCase } from '../../types';

export function addSimulatedUser(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'promptfoo:redteam:simulated-user',
      config: {
        injectVar,
        ...config,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/SimulatedUser`,
    })),
    metadata: {
      ...testCase.metadata,
      strategyId: 'simulated-user',
    },
  }));
}
