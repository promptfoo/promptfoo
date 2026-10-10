import { appendMetricSuffix } from './assertions';

import type { TestCase } from '../../types/index';

export function addMischievousUser(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'promptfoo:redteam:mischievous-user',
      config: {
        injectVar,
        ...config,
      },
    },
    assert: appendMetricSuffix(testCase, 'MischievousUser'),
    metadata: {
      ...testCase.metadata,
      strategyId: 'mischievous-user',
    },
  }));
}
