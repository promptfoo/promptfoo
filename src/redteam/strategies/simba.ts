import logger from '../../logger';
import {
  ADVANCED_REDTEAM_AGENT_DISPLAY_NAME,
  ADVANCED_REDTEAM_AGENT_METRIC_SUFFIX,
  ADVANCED_REDTEAM_AGENT_PROVIDER_ID,
  ADVANCED_REDTEAM_AGENT_STRATEGY_ID,
} from '../constants/advancedRedteamAgent';
import type { TestCase, TestCaseWithPlugin } from '../../types';

export async function addSimbaTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug(`Adding ${ADVANCED_REDTEAM_AGENT_DISPLAY_NAME} test cases`);

  // Advanced Redteam Agent (Simba) strategy creates only a single test case, regardless of input
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
        id: ADVANCED_REDTEAM_AGENT_PROVIDER_ID,
        config: {
          injectVar,
          ...config,
        },
      },
      assert: baseTestCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/${ADVANCED_REDTEAM_AGENT_METRIC_SUFFIX}`,
      })),
      metadata: {
        ...baseTestCase.metadata,
        strategyId: ADVANCED_REDTEAM_AGENT_STRATEGY_ID,
        originalText,
      },
    },
  ];
}
