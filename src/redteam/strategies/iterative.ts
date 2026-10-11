import { createAdaptiveMultiTurnStrategy } from './hydra';

import type { TestCase } from '../../types/index';

export function addIterativeJailbreaks(
  testCases: TestCase[],
  injectVar: string,
  strategy: 'iterative' | 'iterative:tree' | 'iterative:meta' = 'iterative',
  config: Record<string, any>,
): TestCase[] {
  const providerName =
    strategy === 'iterative'
      ? 'promptfoo:redteam:iterative'
      : strategy === 'iterative:tree'
        ? 'promptfoo:redteam:iterative:tree'
        : 'promptfoo:redteam:iterative:meta';

  const metricSuffix =
    strategy === 'iterative'
      ? 'Iterative'
      : strategy === 'iterative:tree'
        ? 'IterativeTree'
        : 'IterativeMeta';

  const strategyId =
    strategy === 'iterative'
      ? 'jailbreak'
      : strategy === 'iterative:tree'
        ? 'jailbreak:tree'
        : 'jailbreak:meta';

  return createAdaptiveMultiTurnStrategy({ providerName, metricSuffix, strategyId }, false)(
    testCases,
    injectVar,
    config,
  );
}
