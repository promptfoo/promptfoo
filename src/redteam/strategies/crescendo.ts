import { addProviderTestCases } from './testCaseAdapters';

import type { TestCase } from '../../types/index';

export function addCrescendo(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return addProviderTestCases(testCases, injectVar, config, {
    providerName: 'promptfoo:redteam:crescendo',
    metricSuffix: 'Crescendo',
    strategyId: 'crescendo',
    forwardPluginInputs: true,
  });
}
