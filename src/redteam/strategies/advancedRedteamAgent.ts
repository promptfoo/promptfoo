import logger from '../../logger';
import { strategyDisplayNames } from '../constants';

import type { TestCase, TestCaseWithPlugin } from '../../types';

export async function addAdvancedRedteamAgentTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug(`Adding ${strategyDisplayNames['advanced-redteam-agent']} test cases`);

  // Advanced Redteam Agent strategy creates only a single test case, regardless of input
  if (testCases.length === 0) {
    return [];
  }

  // Take the first test case as the base and create a single Advanced Redteam Agent test case
  const baseTestCase = testCases[0];
  const originalText = String(baseTestCase.vars![injectVar]);

  return [
    {
      ...baseTestCase,
      provider: {
        id: 'promptfoo:redteam:advanced-redteam-agent',
        config: {
          injectVar,
          ...config,
        },
      },
      assert: baseTestCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/'advanced-redteam-agent'`,
      })),
      metadata: {
        ...baseTestCase.metadata,
        strategyId: 'advanced-redteam-agent',
        originalText,
      },
    },
  ];
}
