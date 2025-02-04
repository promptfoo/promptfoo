import logger from '../../logger';
import type { TestCase, TestCaseWithPlugin } from '../../types';

export async function addGoatTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding GOAT test cases');
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'promptfoo:redteam:goat',
      config: {
        injectVar,
        ...config,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/GOAT`,
    })),
  }));
}
