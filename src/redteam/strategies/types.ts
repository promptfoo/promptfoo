import type { ApiProvider, TestCase, TestCaseWithPlugin } from '../../types/index';

/**
 * Values needed while a strategy is executing but which must never become part of its config.
 * Strategy config is serialized for remote generation and persisted in generated test cases.
 */
export interface StrategyRuntimeContext {
  generationProvider?: ApiProvider;
  /**
   * Provider IDs are safe to save in generated test cases. Provider option objects
   * stay local because their config and env fields can contain resolved credentials.
   */
  generationProviderSpec?: string;
  wrapGenerationProvider?: (provider: ApiProvider) => ApiProvider;
}

/**
 * Adds the request-scoped generation provider to a generated attack-provider config
 * only when it has a persistable provider ID. Provider option objects are deliberately
 * excluded: they can contain resolved env values, API keys, or authorization headers.
 */
export function withPersistableGenerationProvider(
  config: Record<string, any>,
  runtimeContext?: StrategyRuntimeContext,
): Record<string, any> {
  if (!runtimeContext?.generationProviderSpec) {
    return config;
  }

  return {
    ...config,
    redteamProvider: runtimeContext.generationProviderSpec,
  };
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
