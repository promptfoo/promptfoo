import logger from '../../logger';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

/**
 * @deprecated The Simba strategy has been removed.
 * This function exists only for backwards compatibility with existing configs.
 * It logs a deprecation warning and returns an empty array (no-op).
 */
export async function addSimbaTestCases(
  _testCases: TestCaseWithPlugin[],
  _injectVar: string,
  _config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.warn(
    'The "simba" strategy has been deprecated and removed. ' +
      'This strategy will be skipped. Consider using "jailbreak:hydra" as an alternative.',
  );
  return [];
}
