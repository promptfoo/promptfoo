import logger from '../../logger';
import type { TestCase, TestCaseWithPlugin } from '../../types';

export async function addSimbaTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding Simba test cases');
  
  // Simba strategy creates only a single test case, regardless of input
  if (testCases.length === 0) {
    return [];
  }

  // Take the first test case as the base and create a single Simba test case
  const baseTestCase = testCases[0];
  const originalText = String(baseTestCase.vars![injectVar]);

  return [{
    ...baseTestCase,
    provider: {
      id: 'promptfoo:redteam:simba',
      config: {
        injectVar,
        ...config,
      },
    },
    assert: baseTestCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/Simba`,
    })),
    metadata: {
      ...baseTestCase.metadata,
      strategyId: 'simba',
      originalText,
    },
  }];
}