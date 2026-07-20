import type { ApiProvider, TestCase, TestCaseWithPlugin } from '../../types/index';

/**
 * Values needed while a strategy is executing but which must never become part of its config.
 * Strategy config is serialized for remote generation and persisted in generated test cases.
 */
export interface StrategyRuntimeContext {
  generationProvider?: ApiProvider;
  wrapGenerationProvider?: (provider: ApiProvider) => ApiProvider;
}

export interface Strategy {
  id: string;
  action: (
    testCases: TestCaseWithPlugin[],
    injectVar: string,
    config: Record<string, any>,
    strategyId?: string,
    runtimeContext?: StrategyRuntimeContext,
  ) => Promise<TestCase[]>;
  /** Whether this strategy requires pre-extracted intent/goal metadata on test cases. */
  requiresGoalExtraction?: boolean;
}
