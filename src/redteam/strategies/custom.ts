import { addProviderTestCases } from './testCaseAdapters';

import type { TestCase } from '../../types/index';

export function addCustom(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
  strategyId: string = 'custom',
): TestCase[] {
  // Extract variant from strategy ID (e.g., 'custom:aggressive' -> 'aggressive')
  const variant = strategyId.includes(':') ? strategyId.split(':')[1] : '';
  const displayName = variant ? `Custom:${variant}` : 'Custom';

  return addProviderTestCases(
    testCases,
    injectVar,
    { variant, ...config },
    {
      providerName:
        strategyId === 'custom' ? 'promptfoo:redteam:custom' : `promptfoo:redteam:${strategyId}`,
      metricSuffix: displayName,
      strategyId,
    },
  );
}
