import logger from '../../logger';
import { appendMetricSuffix } from './assertions';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

export async function addAuthoritativeMarkupInjectionTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding Authoritative Markup Injection test cases');
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      provider: {
        id: 'promptfoo:redteam:authoritative-markup-injection',
        config: {
          injectVar,
          ...config,
        },
      },
      assert: appendMetricSuffix(testCase, 'AuthoritativeMarkupInjection'),
      metadata: {
        ...testCase.metadata,
        strategyId: 'authoritative-markup-injection',
        originalText,
      },
    };
  });
}
