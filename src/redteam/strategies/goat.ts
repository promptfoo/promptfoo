import type { TestCase } from '../../types';

export function addGoat(testCases: TestCase[], injectVar: string): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'promptfoo:redteam:goat',
      config: {
        injectVar,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/GOAT`,
    })),
  }));
}