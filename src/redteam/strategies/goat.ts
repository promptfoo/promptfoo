import logger from '../../logger.js';

import type { TestCase, TestCaseWithPlugin } from '../../types/index.js';

export async function addGoatTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding GOAT test cases');
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
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
      metadata: {
        ...testCase.metadata,
        strategyId: 'goat',
        originalText,
      },
    };
  });
}
