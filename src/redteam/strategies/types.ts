import type { TestCase, TestCaseWithPlugin } from '../../types/index';

export interface Strategy {
  id: string;
  action: (
    testCases: TestCaseWithPlugin[],
    injectVar: string,
    config: Record<string, any>,
    strategyId?: string,
  ) => Promise<TestCase[]>;
  /** Whether this strategy requires pre-extracted intent/goal metadata on test cases. */
  requiresGoalExtraction?: boolean;
}
