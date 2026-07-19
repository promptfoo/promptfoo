import type { TestCase, TestCaseWithPlugin } from '../../types/index';

// Keep strategy implementations within the redteam layer instead of adding another
// direct redteam -> legacy-contracts dependency for each shared strategy type.
export type { TestCase };

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
