import logger from '../../logger';
import { createAdaptiveMultiTurnStrategy } from './hydra';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

export async function addGoatTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding GOAT test cases');
  return createAdaptiveMultiTurnStrategy(
    { providerName: 'promptfoo:redteam:goat', metricSuffix: 'GOAT', strategyId: 'goat' },
    false,
  )(testCases, injectVar, config);
}
