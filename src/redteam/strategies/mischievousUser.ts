import type { TestCase } from '../../types';
import { REDTEAM_MISCHIEVOUS_USER_STRATEGY_ID } from '../constants/strategies';

export function addMischievousUser(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: `promptfoo:redteam:${REDTEAM_MISCHIEVOUS_USER_STRATEGY_ID}`,
      config: {
        injectVar,
        ...config,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/MischievousUser`,
    })),
    metadata: {
      ...testCase.metadata,
      strategyId: REDTEAM_MISCHIEVOUS_USER_STRATEGY_ID,
    },
  }));
}
