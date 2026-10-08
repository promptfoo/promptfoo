import logger from '../../logger';
import { addProviderTestCases } from './testCaseAdapters';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

export async function addGoatTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding GOAT test cases');
  return addProviderTestCases(testCases, injectVar, config, {
    providerName: 'promptfoo:redteam:goat',
    metricSuffix: 'GOAT',
    strategyId: 'goat',
    forwardPluginInputs: true,
  });
}
