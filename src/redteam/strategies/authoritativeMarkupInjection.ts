import logger from '../../logger';
import { addProviderTestCases } from './testCaseAdapters';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

export async function addAuthoritativeMarkupInjectionTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding Authoritative Markup Injection test cases');
  return addProviderTestCases(testCases, injectVar, config, {
    providerName: 'promptfoo:redteam:authoritative-markup-injection',
    metricSuffix: 'AuthoritativeMarkupInjection',
    strategyId: 'authoritative-markup-injection',
  });
}
