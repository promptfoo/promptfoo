import { createAdaptiveMultiTurnStrategy } from './hydra';

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

  return createAdaptiveMultiTurnStrategy(
    {
      providerName: `promptfoo:redteam:${strategyId}`,
      metricSuffix: displayName,
      strategyId,
      defaults: { variant },
      forwardPluginInputs: false,
    },
    false,
  )(testCases, injectVar, config);
}
