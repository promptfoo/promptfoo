import { createAdaptiveMultiTurnStrategy } from './hydra';

import type { TestCase } from '../../types/index';

export function addReactCrescendo(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return createAdaptiveMultiTurnStrategy(
    {
      providerName: 'promptfoo:redteam:react-crescendo',
      metricSuffix: 'ReactCrescendo',
      strategyId: 'react-crescendo',
    },
    false,
  )(testCases, injectVar, config);
}
