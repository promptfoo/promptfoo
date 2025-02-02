import type { TestCase } from '../../types';

export function addAutoDan(
  testCases: TestCase[],
  injectVar: string,
  config?: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'promptfoo:redteam:autodan',
      config: {
        injectVar,
        ...config,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/AutoDan`,
    })),
  }));
}
