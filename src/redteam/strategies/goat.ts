import logger from '../../logger';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

export async function addGoatTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding GOAT test cases');
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    // Get inputs from plugin config if available
    const pluginConfig = testCase.metadata?.pluginConfig as Record<string, unknown> | undefined;
    const inputs = pluginConfig?.inputs as Record<string, string> | undefined;

    return {
      ...testCase,
      provider: {
        id: 'promptfoo:redteam:goat',
        config: {
          injectVar,
          ...config,
          // Pass inputs from plugin config to GOAT provider
          ...(inputs && { inputs }),
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
