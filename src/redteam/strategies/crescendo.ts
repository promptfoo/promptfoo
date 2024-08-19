import type { TestCase } from '../../types';

export function addCrescendo(testCases: TestCase[], injectVar: string): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'promptfoo:redteam:crescendo',
      config: {
        injectVar,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/Crescendo`,
    })),
  }));
}
