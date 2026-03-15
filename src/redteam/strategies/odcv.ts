import logger from '../../logger';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

export async function addOdcvTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding ODCV test cases');
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    const pluginConfig = testCase.metadata?.pluginConfig as Record<string, unknown> | undefined;
    const inputs = pluginConfig?.inputs as Record<string, string> | undefined;

    return {
      ...testCase,
      provider: {
        id: 'promptfoo:redteam:odcv',
        config: {
          injectVar,
          ...config,
          ...(inputs && { inputs }),
        },
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/ODCV`,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId: 'odcv',
        originalText,
      },
    };
  });
}
