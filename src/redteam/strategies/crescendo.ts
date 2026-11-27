import { createAdaptiveMultiTurnStrategy } from './hydra';

import type { TestCase } from '../../types/index';

export function addCrescendo(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return createAdaptiveMultiTurnStrategy(
    {
      providerName: 'promptfoo:redteam:crescendo',
      metricSuffix: 'Crescendo',
      strategyId: 'crescendo',
    },
    false,
  )(testCases, injectVar, config);
}
