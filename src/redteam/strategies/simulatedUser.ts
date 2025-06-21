import type { TestCase } from '../../types';
import { REDTEAM_SIMULATED_USER_STRATEGY_ID } from '../constants/strategies';

export function addSimulatedUser(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: `promptfoo:redteam:${REDTEAM_SIMULATED_USER_STRATEGY_ID}`,
      config: {
        injectVar,
        ...config,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/SimulatedUser`,
    })),
    metadata: {
      ...testCase.metadata,
      strategyId: REDTEAM_SIMULATED_USER_STRATEGY_ID,
    },
  }));
}
