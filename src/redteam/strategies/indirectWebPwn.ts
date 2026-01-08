import { v4 as uuidv4 } from 'uuid';

import logger from '../../logger';
import type { TestCase, TestCaseWithPlugin } from '../../types/index';

export async function addIndirectWebPwnTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug(`Adding Indirect Web Pwn test cases to ${testCases.length} test cases`);

  const providerName = 'promptfoo:redteam:indirect-web-pwn';
  const metricSuffix = 'IndirectWebPwn';
  const strategyId = 'indirect-web-pwn';
  const scanId = uuidv4();

  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      provider: {
        id: providerName,
        config: {
          injectVar,
          scanId,
          ...config,
        },
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/${metricSuffix}`,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId,
        originalText,
      },
    };
  });
}
